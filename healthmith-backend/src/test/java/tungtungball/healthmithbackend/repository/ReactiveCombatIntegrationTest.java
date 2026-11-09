package tungtungball.healthmithbackend.repository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import reactor.test.StepVerifier;
import tools.jackson.databind.JsonNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.mockJwt;

@SpringBootTest
class ReactiveCombatIntegrationTest extends ReactiveApiIntegrationSupport {
    @BeforeEach
    void combatFixtures() throws Exception {
        ADMIN.sql("TRUNCATE private.battles CASCADE").then().block();
        ADMIN.sql("INSERT INTO public.combat_rulesets VALUES ('test-v1', CAST(:rules AS jsonb), true) ON CONFLICT(version) DO NOTHING")
                .bind("rules", Files.readString(Path.of("src/test/resources/db/combat-rules-fixture.json"))).then().block();
        ADMIN.sql("INSERT INTO public.combat_encounters VALUES ('TEST_NPC','테스트 적','test-v1', "
                + "'{\"hp\":100,\"mana\":100,\"action_interval_ms\":60000,\"actions\":[\"TEST_BOLT\"]}',true) ON CONFLICT(id) DO NOTHING").then().block();
    }

    String earnedGem() {
        JsonNode completed = completedWorkout();
        return get("/api/workout-sessions/" + completed.path("id").asString() + "/result").path("gem").path("id").asString();
    }

    @Test
    void pveCastReplayRejectionEventsAndSurrenderPreserveState() {
        String gem = earnedGem();
        assertEquals("TEST_BOLT", get("/api/spells").path("spells").get(0).path("id").asString());
        assertEquals(1, get("/api/pve-encounters").path("items").size());
        JsonNode deck = get("/api/gems/" + gem + "/spell-loadout");
        request(A, HttpMethod.PUT, "/api/gems/" + gem + "/spell-loadout",
                Map.of("spell_ids", List.of("TEST_BOLT"), "expected_version", deck.path("version")), UUID.randomUUID().toString(), 200);
        JsonNode battle = post("/api/pve-battles", Map.of("gem_id", gem, "encounter_id", "TEST_NPC"), 201);
        String id = battle.path("id").asString();
        request(B, HttpMethod.GET, "/api/battles/" + id, null, null, 404);
        assertEquals(id, get("/api/me/battles/current").path("battle").path("id").asString());
        battle = post("/api/battles/" + id + "/ready", Map.of("expected_version", battle.path("version")), 200);
        assertEquals("active", battle.path("status").asString());
        String key = UUID.randomUUID().toString();
        var drawing = Map.of("canvas_width", 100, "canvas_height", 100, "strokes", List.of(Map.of("points",
                List.of(Map.of("x", 0.0, "y", 0.0, "t_ms", 0), Map.of("x", 1.0, "y", 1.0, "t_ms", 100)))));
        var cast = Map.of("client_cast_id", key, "client_sequence", 1, "spell_id", "TEST_BOLT", "rune_template_version", "test-v1", "drawing", drawing);
        String castPath = "/api/battles/" + id + "/casts";
        JsonNode receipt = request(A, HttpMethod.POST, castPath, cast, key, 200);
        assertEquals("applied", receipt.path("status").asString());
        assertEquals(10, receipt.path("mana_spent").asInt());
        assertEquals(receipt, request(A, HttpMethod.POST, castPath, cast, key, 200));
        assertEquals(receipt, get(castPath + "/" + receipt.path("id").asString()));
        battle = get("/api/battles/" + id);
        assertEquals(90, battle.path("participants").get(0).path("mana").asInt());
        assertEquals(90, battle.path("participants").get(1).path("hp").asInt());
        // 반대 방향은 정상 형식의 입력이지만 등록 문양과 다르므로 영수증만 남는다.
        String failedKey = UUID.randomUUID().toString();
        var reverse = Map.of("canvas_width", 100, "canvas_height", 100, "strokes", List.of(Map.of("points",
                List.of(Map.of("x", 1.0, "y", 1.0, "t_ms", 0), Map.of("x", 0.0, "y", 0.0, "t_ms", 100)))));
        JsonNode rejected = request(A, HttpMethod.POST, castPath,
                Map.of("client_cast_id", failedKey, "client_sequence", 2, "spell_id", "TEST_BOLT", "rune_template_version", "test-v1", "drawing", reverse), failedKey, 200);
        assertEquals("rejected", rejected.path("status").asString());
        assertEquals(0, rejected.path("mana_spent").asInt());
        battle = get("/api/battles/" + id);
        assertEquals(3, battle.path("next_cast_sequence").asLong());
        post("/api/battles/" + id + "/surrender", Map.of("expected_version", battle.path("version")), 200);
        assertEquals("loss", get("/api/battles/" + id + "/result").path("outcome").asString());
        assertEquals("available", get("/api/gems/" + gem).path("availability").asString());
        assertEquals(1, get("/api/me/battle-records?mode=pve").path("items").size());

        // 실제 SSE 응답 body를 끝까지 읽어 DB 사용자 문맥이 스트림에서도 유지되는지 확인한다.
        var stream = http.mutateWith(mockJwt().jwt(jwt -> jwt.subject(A).expiresAt(Instant.now().plusSeconds(60))))
                .get().uri("/api/battles/" + id + "/events?after_event_id=0").accept(MediaType.TEXT_EVENT_STREAM)
                .exchange().expectStatus().isOk().returnResult(String.class).getResponseBody();
        var events = stream.collectList().block(Duration.ofSeconds(10));
        assertFalse(events.isEmpty());
        assertTrue(events.stream().anyMatch(event -> event.contains("battle_version")));
        request(B, HttpMethod.GET, "/api/battles/" + id + "/events?after_event_id=0", null, null, 404);
    }

    @Test
    void changedReplayAndStaleSequenceDoNotSpendManaOrAppendEvents() {
        String gem = earnedGem();
        JsonNode battle = post("/api/pve-battles", Map.of("gem_id", gem, "encounter_id", "TEST_NPC"), 201);
        String path = "/api/battles/" + battle.path("id").asString();
        post(path + "/ready", Map.of("expected_version", battle.path("version")), 200);
        String key = UUID.randomUUID().toString();
        var cast = Map.of("client_cast_id", key, "client_sequence", 1, "spell_id", "TEST_BOLT",
                "rune_template_version", "test-v1", "drawing", testDrawing(false));
        JsonNode receipt = request(A, HttpMethod.POST, path + "/casts", cast, key, 200);
        assertEquals("applied", receipt.path("status").asString());
        JsonNode after = get(path);

        JsonNode changed = request(A, HttpMethod.POST, path + "/casts",
                Map.of("client_cast_id", key, "client_sequence", 1, "spell_id", "TEST_BOLT",
                        "rune_template_version", "test-v1", "drawing", testDrawing(true)), key, 409);
        assertEquals("IDEMPOTENCY_CONFLICT", changed.path("code").asString());
        String staleKey = UUID.randomUUID().toString();
        JsonNode stale = request(A, HttpMethod.POST, path + "/casts",
                Map.of("client_cast_id", staleKey, "client_sequence", 1, "spell_id", "TEST_BOLT",
                        "rune_template_version", "test-v1", "drawing", testDrawing(false)), staleKey, 409);
        assertEquals("CAST_SEQUENCE_CONFLICT", stale.path("code").asString());

        assertEquals(receipt, request(A, HttpMethod.POST, path + "/casts", cast, key, 200));
        assertEquals(after, get(path));
        assertEquals(1L, ADMIN.sql("SELECT count(*) AS n FROM private.cast_receipts WHERE battle_id=:id")
                .bind("id", UUID.fromString(battle.path("id").asString()))
                .map((row, metadata) -> row.get("n", Long.class)).one().block(Duration.ofSeconds(10)));
    }

    @Test
    void absentRulesetDoesNotLockTheGemOrCreateAMatch() {
        String gem = earnedGem();
        ADMIN.sql("UPDATE public.combat_rulesets SET enabled=false WHERE version='test-v1'").then().block(Duration.ofSeconds(10));
        try {
            JsonNode pve = request(A, HttpMethod.POST, "/api/pve-battles", Map.of("gem_id", gem, "encounter_id", "TEST_NPC"), UUID.randomUUID().toString(), 503);
            assertEquals("POLICY_NOT_CONFIGURED", pve.path("code").asString());
            JsonNode match = request(A, HttpMethod.POST, "/api/pvp-matchmaking-tickets", Map.of("gem_id", gem), UUID.randomUUID().toString(), 503);
            assertEquals("POLICY_NOT_CONFIGURED", match.path("code").asString());
            assertEquals("available", get("/api/gems/" + gem).path("availability").asString());
            assertTrue(get("/api/pvp-matchmaking-tickets/current").path("ticket").isNull());
            assertTrue(get("/api/me/battles/current").path("battle").isNull());
        } finally {
            ADMIN.sql("UPDATE public.combat_rulesets SET enabled=true WHERE version='test-v1'").then().block(Duration.ofSeconds(10));
        }
    }

    @Test
    void workerExpiresAnUnmatchedTicketAndUnlocksItsGem() {
        String gem = earnedGem();
        JsonNode ticket = post("/api/pvp-matchmaking-tickets", Map.of("gem_id", gem), 201);
        assertEquals("reserved", get("/api/gems/" + gem).path("availability").asString());
        ADMIN.sql("UPDATE public.matchmaking_tickets SET created_at=now()-interval '1 day' WHERE id=:id")
                .bind("id", UUID.fromString(ticket.path("id").asString())).then().block(Duration.ofSeconds(10));

        worker.combatTick().block(Duration.ofSeconds(10));
        JsonNode expired = get("/api/pvp-matchmaking-tickets/" + ticket.path("id").asString());
        assertEquals("expired", expired.path("status").asString());
        assertEquals(ticket.path("version").asLong() + 1, expired.path("version").asLong());
        assertEquals("available", get("/api/gems/" + gem).path("availability").asString());
        assertTrue(get("/api/pvp-matchmaking-tickets/current").path("ticket").isNull());
        assertTrue(get("/api/me/battles/current").path("battle").isNull());
    }

    private Map<String, Object> testDrawing(boolean reverse) {
        return Map.of("canvas_width", 100, "canvas_height", 100, "strokes", List.of(Map.of("points",
                List.of(Map.of("x", reverse ? 1.0 : 0.0, "y", reverse ? 1.0 : 0.0, "t_ms", 0),
                        Map.of("x", reverse ? 0.0 : 1.0, "y", reverse ? 0.0 : 1.0, "t_ms", 100)))));
    }

    @Test
    void pvpTicketCancelMatchAndParticipantResultsUseAtomicCommands() {
        String gemA = earnedGem();
        activeUser = B;
        String gemB = earnedGem();
        activeUser = A;
        JsonNode ticket = post("/api/pvp-matchmaking-tickets", Map.of("gem_id", gemA), 201);
        String ticketId = ticket.path("id").asString();
        get("/api/pvp-matchmaking-tickets/" + ticketId);
        get("/api/pvp-matchmaking-tickets/current");
        assertEquals("cancelled", post("/api/pvp-matchmaking-tickets/" + ticketId + "/cancel", Map.of("expected_version", ticket.path("version")), 200).path("status").asString());
        ticket = post("/api/pvp-matchmaking-tickets", Map.of("gem_id", gemA), 201);
        JsonNode other = request(B, HttpMethod.POST, "/api/pvp-matchmaking-tickets", Map.of("gem_id", gemB), UUID.randomUUID().toString(), 201);
        assertEquals("matched", other.path("status").asString());
        String id = other.path("battle_id").asString();
        JsonNode battle = get("/api/battles/" + id);
        post("/api/battles/" + id + "/ready", Map.of("expected_version", battle.path("version")), 200);
        battle = request(B, HttpMethod.GET, "/api/battles/" + id, null, null, 200);
        battle = request(B, HttpMethod.POST, "/api/battles/" + id + "/ready", Map.of("expected_version", battle.path("version")), UUID.randomUUID().toString(), 200);
        assertEquals("active", battle.path("status").asString());
        post("/api/battles/" + id + "/surrender", Map.of("expected_version", battle.path("version")), 200);
        assertEquals("loss", get("/api/battles/" + id + "/result").path("outcome").asString());
        assertEquals("win", request(B, HttpMethod.GET, "/api/battles/" + id + "/result", null, null, 200).path("outcome").asString());
        worker.combatTick().block(Duration.ofSeconds(10));
    }
}
