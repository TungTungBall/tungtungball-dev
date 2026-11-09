package tungtungball.healthmithbackend.repository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.repository.r2dbc.WorkerDatabase;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.*;

@SpringBootTest
class ReactiveWorkoutIntegrationTest extends ReactiveApiIntegrationSupport {
    @Autowired JourneyStore journey;
    @Test
    void unconfirmedOrStaleStartDoesNotCreateAWorkout() {
        JsonNode draft = generatedCurriculum();
        String cid = draft.path("id").asString();
        JsonNode refused = request(A, HttpMethod.POST, "/api/workout-sessions",
                Map.of("curriculum_id", cid, "expected_curriculum_version", draft.path("version")), UUID.randomUUID().toString(), 409);
        assertEquals("INVALID_STATE", refused.path("code").asString());
        assertTrue(get("/api/workout-sessions/current").path("session").isNull());

        JsonNode confirmed = post("/api/curricula/" + cid + "/confirmations", Map.of("expected_version", draft.path("version")), 200);
        JsonNode stale = request(A, HttpMethod.POST, "/api/workout-sessions",
                Map.of("curriculum_id", cid, "expected_curriculum_version", draft.path("version")), UUID.randomUUID().toString(), 409);
        assertEquals("VERSION_CONFLICT", stale.path("code").asString());
        assertTrue(get("/api/workout-sessions/current").path("session").isNull());

        JsonNode session = post("/api/workout-sessions",
                Map.of("curriculum_id", cid, "expected_curriculum_version", confirmed.path("version")), 201);
        request(A, HttpMethod.POST, "/api/workout-sessions",
                Map.of("curriculum_id", cid, "expected_curriculum_version", confirmed.path("version")), UUID.randomUUID().toString(), 409);
        assertEquals(session, get("/api/workout-sessions/" + session.path("id").asString()));
        assertEquals(1L, ADMIN.sql("SELECT count(*) AS n FROM public.workout_sessions")
                .map((row, metadata) -> row.get("n", Long.class)).one().block(Duration.ofSeconds(10)));
    }

    @Test
    void foreignUserCannotConfirmStartOrChangeAnotherUsersWorkout() {
        JsonNode draft = generatedCurriculum();
        String cid = draft.path("id").asString();
        request(B, HttpMethod.POST, "/api/curricula/" + cid + "/confirmations",
                Map.of("expected_version", draft.path("version")), UUID.randomUUID().toString(), 404);
        assertEquals(draft, get("/api/curricula/" + cid));
        JsonNode confirmed = post("/api/curricula/" + cid + "/confirmations", Map.of("expected_version", draft.path("version")), 200);
        request(B, HttpMethod.POST, "/api/workout-sessions",
                Map.of("curriculum_id", cid, "expected_curriculum_version", confirmed.path("version")), UUID.randomUUID().toString(), 404);
        JsonNode session = post("/api/workout-sessions",
                Map.of("curriculum_id", cid, "expected_curriculum_version", confirmed.path("version")), 201);
        String path = "/api/workout-sessions/" + session.path("id").asString();
        request(B, HttpMethod.POST, path + "/repetitions", Map.of("event_id", UUID.randomUUID().toString(),
                "stage_index", 1, "expected_version", session.path("version")), null, 404);
        request(B, HttpMethod.POST, path + "/pause",
                Map.of("expected_version", session.path("version"), "reason", "manual"), UUID.randomUUID().toString(), 404);
        assertEquals(session, get(path));
        assertEquals(0, get("/api/me/gems").path("items").size());
    }

    @Test
    void wrongStageStaleVersionAndPausedRepetitionsLeaveProgressUnchanged() {
        JsonNode draft = generatedCurriculum();
        String cid = draft.path("id").asString();
        JsonNode confirmed = post("/api/curricula/" + cid + "/confirmations", Map.of("expected_version", draft.path("version")), 200);
        JsonNode session = post("/api/workout-sessions",
                Map.of("curriculum_id", cid, "expected_curriculum_version", confirmed.path("version")), 201);
        String path = "/api/workout-sessions/" + session.path("id").asString();
        JsonNode wrongStage = request(A, HttpMethod.POST, path + "/repetitions", Map.of("event_id", UUID.randomUUID().toString(),
                "stage_index", 2, "expected_version", session.path("version")), null, 409);
        assertEquals("INVALID_STATE", wrongStage.path("code").asString());
        JsonNode stale = request(A, HttpMethod.POST, path + "/repetitions", Map.of("event_id", UUID.randomUUID().toString(),
                "stage_index", 1, "expected_version", session.path("version").asLong() + 1), null, 409);
        assertEquals("VERSION_CONFLICT", stale.path("code").asString());
        assertEquals(session, get(path));

        JsonNode paused = post(path + "/pause", Map.of("expected_version", session.path("version"), "reason", "manual"), 200);
        request(A, HttpMethod.POST, path + "/repetitions", Map.of("event_id", UUID.randomUUID().toString(),
                "stage_index", 1, "expected_version", paused.path("version")), null, 409);
        assertEquals(paused, get(path));
        assertEquals(0L, ADMIN.sql("SELECT count(*) AS n FROM private.workout_events")
                .map((row, metadata) -> row.get("n", Long.class)).one().block(Duration.ofSeconds(10)));
        assertEquals(0, get("/api/me/gems").path("items").size());
    }

    @Test
    void fullWorkoutFeedbackAndSummaryFlowUsesR2dbcAndRestrictedWorker() {
        JsonNode session = completedWorkout();
        String path = "/api/workout-sessions/" + session.path("id").asString() + "/feedback";
        assertTrue(get(path).path("feedback").isNull());
        JsonNode saved = post(path, Map.of("soreness_body_parts", java.util.List.of("없음"), "difficulty", 3, "enjoyment", 4), 201);
        assertNotNull(saved.path("feedback").path("id").asString());
        assertEquals(1, get("/api/me/workout-stats").path("completed_sessions").asInt());
        assertEquals(1, get("/api/me/workout-records").path("items").size());
        get(path);
        post("/api/feedback/" + saved.path("feedback").path("id").asString() + "/next-curriculum-generation-requests", Map.of(), 202);
        post("/api/me/workout-tendency/generation-requests", Map.of(), 202);
        JsonNode next = worker.generation("poll", workerId, 300, Map.of()).block();
        assertEquals("curriculum", next.path("kind").asString());
        worker.generation("fail", workerId, 300, Map.of("request_id", next.path("request_id"), "lease_token", next.path("lease_token"), "kind", "curriculum", "code", "LLM_UNAVAILABLE")).block();
        JsonNode summary = worker.generation("poll", workerId, 300, Map.of()).block();
        assertEquals("summary", summary.path("kind").asString());
        assertTrue(worker.generation("publish_summary", workerId, 300, Map.of("request_id", summary.path("request_id"), "lease_token", summary.path("lease_token"), "summary", "테스트 요약")).block().asBoolean());
        assertEquals("테스트 요약", get("/api/me/workout-tendency").path("summary").asString());
        get("/api/workout-tendency-generation-requests/" + summary.path("request_id").asString());
        request(B, HttpMethod.GET, "/api/workout-sessions/" + session.path("id").asString(), null, null, 404);
    }

    @Test
    void regenerationFailureAndAbandonNeverIssueGemOrFeedback() {
        JsonNode old = generatedCurriculum();
        String cid = old.path("id").asString();
        post("/api/curricula/" + cid + "/regenerations", Map.of("expected_version", old.path("version")), 202);
        assertEquals("rejected", get("/api/curricula/" + cid).path("status").asString());
        JsonNode claim = worker.generation("poll", workerId, 300, Map.of()).block();
        worker.generation("fail", workerId, 300, Map.of("request_id", claim.path("request_id"), "lease_token", claim.path("lease_token"), "kind", "curriculum", "code", "LLM_UNAVAILABLE")).block();
        JsonNode fresh = generatedCurriculum();
        JsonNode confirmed = post("/api/curricula/" + fresh.path("id").asString() + "/confirmations", Map.of("expected_version", fresh.path("version")), 200);
        JsonNode session = post("/api/workout-sessions", Map.of("curriculum_id", fresh.path("id"), "expected_curriculum_version", confirmed.path("version")), 201);
        String path = "/api/workout-sessions/" + session.path("id").asString();
        JsonNode paused = post(path + "/pause", Map.of("expected_version", session.path("version"), "reason", "manual"), 200);
        JsonNode abandoned = post(path + "/abandon", Map.of("expected_version", paused.path("version")), 200);
        assertEquals("abandoned", abandoned.path("status").asString());
        assertTrue(get(path + "/result").path("gem").isNull());
        assertEquals(0, get("/api/me/gems").path("items").size());
        request(A, HttpMethod.POST, path + "/feedback", Map.of("soreness_body_parts", java.util.List.of("없음"), "difficulty", 3, "enjoyment", 4), UUID.randomUUID().toString(), 409);
    }

    @Test
    void concurrentConfirmationRetriesProduceOneVersionAndOneReceipt() {
        JsonNode curriculum = generatedCurriculum();
        UUID id = UUID.fromString(curriculum.path("id").asString());
        UUID key = UUID.randomUUID();
        var payload = Map.of("expected_version", curriculum.path("version"));
        var type = mapper.constructType(tungtungball.healthmithbackend.dto.CurriculumResponse.class);
        var first = journey.<tungtungball.healthmithbackend.dto.CurriculumResponse>command("confirm", id, key, payload, "unused", type);
        var second = journey.<tungtungball.healthmithbackend.dto.CurriculumResponse>command("confirm", id, key, payload, "unused", type);
        var results = ReactiveSurveyIntegrationTest.asUser(UUID.fromString(A), reactor.core.publisher.Mono.zip(first, second)).block();
        assertEquals(results.getT1(), results.getT2());
        assertEquals(2L, results.getT1().version());
        assertEquals(1L, ADMIN.sql("SELECT count(*) AS n FROM private.journey_receipts WHERE resource_id=:id AND operation='confirm'")
                .bind("id", id).map((row, metadata) -> row.get("n", Long.class)).one().block());
    }
}
