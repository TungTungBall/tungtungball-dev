package tungtungball.healthmithbackend.repository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.web.reactive.server.WebTestClient;
import tools.jackson.databind.json.JsonMapper;
import java.util.List;
import tungtungball.healthmithbackend.config.error.ApiException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import tungtungball.healthmithbackend.dto.SurveyV2;
import tungtungball.healthmithbackend.service.SurveyV2Service;
import tungtungball.healthmithbackend.repository.r2dbc.UserDatabase;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.*;

@SpringBootTest
class SurveyV2IntegrationTest extends PostgresIntegrationSupport {
    private static final String A = "20000000-0000-4000-8000-000000000001";
    private static final String B = "20000000-0000-4000-8000-000000000002";
    private static final String PATH = "/api/v2/survey-submissions";
    private static final String ANSWERS = """
        {"goal":"habit","experience":"occasional","available_minutes":20,
        "days_per_week":3,"limitations_present":true,"limitations":[{"part":"wrist","side":"left","severity":"moderate"}],
        "priority_body_parts":["arms","shoulder"]}
        """;
    @Autowired ApplicationContext context;
    @Autowired JsonMapper mapper;
    @Autowired SurveyV2Service service;
    @Autowired UserDatabase database;
    WebTestClient client;
    @BeforeEach void setup() {
        client = WebTestClient.bindToApplicationContext(context).apply(springSecurity()).configureClient().build();
    }
    WebTestClient as(String owner) { return client.mutateWith(mockJwt().jwt(jwt -> jwt.subject(owner))); }
    String create(String key) {
        return as(A).post().uri(PATH).header("Idempotency-Key", key).header("Content-Type", "application/json")
                .bodyValue("{\"answers\":" + ANSWERS + "}").exchange().expectStatus().isCreated()
                .expectBody(String.class).returnResult().getResponseBody();
    }
    @Test void createReadUpdateReplayAndOldApiCoexist() {
        String key = UUID.randomUUID().toString();
        String first = create(key);
        assertEquals(mapper.readTree(first), mapper.readTree(create(key)));
        String id = mapper.readTree(first).path("id").asString();
        as(A).get().uri(PATH+"/"+id).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.schema_version").isEqualTo(2).jsonPath("$.version").isEqualTo(1)
                .jsonPath("$.answers.limitations[0].side").isEqualTo("left")
                .jsonPath("$.answers.priority_body_parts[0]").isEqualTo("arms")
                .jsonPath("$.user_id").doesNotExist();
        String editKey = UUID.randomUUID().toString();
        String changed = ANSWERS.replace("\"available_minutes\":20", "\"available_minutes\":45");
        for (int i=0;i<2;i++) as(A).patch().uri(PATH+"/"+id).header("Idempotency-Key", editKey)
                .header("Content-Type","application/json").bodyValue("{\"expected_version\":1,\"answers\":"+changed+"}")
                .exchange().expectStatus().isOk().expectBody().jsonPath("$.version").isEqualTo(2)
                .jsonPath("$.answers.available_minutes").isEqualTo(45);
        as(A).get().uri(PATH+"/latest").exchange().expectStatus().isOk().expectBody().jsonPath("$.id").isEqualTo(id);
        as(A).post().uri("/api/survey-submissions").header("Content-Type","application/json")
                .bodyValue("""
                {"answers":{"physical_limitations":{"present":false,"body_parts":[]},"purpose":{"type":"체력","custom_text":null},"intensity":5,"priority_body_parts":["상체"]}}
                """).exchange().expectStatus().isCreated().expectBody().jsonPath("$.answers.intensity").isEqualTo(5);
    }
    @Test void rejectsForeignAccessConflictsAndUnauthenticated() {
        String key = UUID.randomUUID().toString();
        String id = mapper.readTree(create(key)).path("id").asString();
        as(B).get().uri(PATH+"/"+id).exchange().expectStatus().isNotFound();
        as(B).patch().uri(PATH+"/"+id).header("Idempotency-Key",UUID.randomUUID().toString())
                .header("Content-Type","application/json").bodyValue("{\"expected_version\":1,\"answers\":"+ANSWERS+"}")
                .exchange().expectStatus().isNotFound();
        as(A).patch().uri(PATH+"/"+id).header("Idempotency-Key",UUID.randomUUID().toString())
                .header("Content-Type","application/json").bodyValue("{\"expected_version\":2,\"answers\":"+ANSWERS+"}")
                .exchange().expectStatus().isEqualTo(409).expectBody().jsonPath("$.code").isEqualTo("VERSION_CONFLICT");
        as(A).post().uri(PATH).header("Idempotency-Key",key).header("Content-Type","application/json")
                .bodyValue("{\"answers\":"+ANSWERS.replace("habit","fitness")+"}").exchange()
                .expectStatus().isEqualTo(409).expectBody().jsonPath("$.code").isEqualTo("IDEMPOTENCY_CONFLICT");
        client.get().uri(PATH+"/"+id).exchange().expectStatus().isUnauthorized();
        client.post().uri(PATH).header("Content-Type","application/json").bodyValue("{\"answers\":"+ANSWERS+"}")
                .exchange().expectStatus().isUnauthorized();
    }
    @Test void invalidValuesAreRejectedByHttpAndDatabase() {
        for (String invalid : new String[]{
                ANSWERS.replace("wrist","other"), ANSWERS.replace("left","center"), ANSWERS.replace("moderate","extreme"),
                ANSWERS.replace("\"days_per_week\":3","\"days_per_week\":0"),
                ANSWERS.replace("\"available_minutes\":20","\"available_minutes\":20.5"),
                ANSWERS.replace("\"limitations_present\":true","\"limitations_present\":false"),
                ANSWERS.replace("\"experience\":\"occasional\"","\"experience\":\"unknown\""),
                ANSWERS.replace("\"arms\",\"shoulder\"","\"arms\",\"arms\""),
                ANSWERS.replace("\"experience\":\"occasional\"", "\"experience\":null")}) {
            as(A).post().uri(PATH).header("Idempotency-Key", UUID.randomUUID().toString()).header("Content-Type","application/json")
                    .bodyValue("{\"answers\":"+invalid+"}").exchange().expectStatus().isBadRequest();
            Boolean valid = ADMIN.sql("SELECT private.is_valid_survey_v2(CAST(:a AS jsonb)) AS valid")
                    .bind("a",invalid).map((row,meta)->row.get("valid",Boolean.class)).one().block();
            assertEquals(false,valid,invalid);
        }
    }
    @Test void noLimitationsAndEmptyPreferencesAreAccepted() {
        String plain = ANSWERS.replace("\"limitations_present\":true", "\"limitations_present\":false")
                .replace("[{\"part\":\"wrist\",\"side\":\"left\",\"severity\":\"moderate\"}]", "[]")
                .replace("[\"arms\",\"shoulder\"]", "[]");
        as(A).post().uri(PATH).header("Idempotency-Key",UUID.randomUUID().toString()).header("Content-Type","application/json")
                .bodyValue("{\"answers\":"+plain+"}").exchange().expectStatus().isCreated().expectBody()
                .jsonPath("$.answers.priority_body_parts.length()").isEqualTo(0);
    }
    @Test void concurrentRequestsReplayAndOnlyOneCompetingUpdateWins() {
        var answers = mapper.readValue(ANSWERS, SurveyV2.Answers.class);
        UUID owner = UUID.fromString(A);
        String key = UUID.randomUUID().toString();
        var created = Flux.merge(List.of(
                ReactiveSurveyIntegrationTest.asUser(owner, service.save(null,null,key,answers)),
                ReactiveSurveyIntegrationTest.asUser(owner, service.save(null,null,key,answers))))
                .collectList().block();
        assertEquals(created.get(0),created.get(1));
        String id = created.get(0).id().toString();
        var outcomes = Flux.merge(List.of(
                ReactiveSurveyIntegrationTest.asUser(owner,service.save(id,1L,UUID.randomUUID().toString(),answers)).map(v -> "saved").onErrorResume(ApiException.class, error -> { assertEquals("VERSION_CONFLICT", error.getCode()); return Mono.just("conflict"); }),
                ReactiveSurveyIntegrationTest.asUser(owner,service.save(id,1L,UUID.randomUUID().toString(),answers)).map(v -> "saved").onErrorResume(ApiException.class, error -> { assertEquals("VERSION_CONFLICT", error.getCode()); return Mono.just("conflict"); })))
                .collectList().block();
        assertEquals(1,outcomes.stream().filter("saved"::equals).count());
        assertEquals(1,outcomes.stream().filter("conflict"::equals).count());
        var row = ReactiveSurveyIntegrationTest.asUser(owner,service.find(id)).block();
        assertEquals(2L,row.version());
    }
    @Test void databaseDeniesDirectWritesAndHidesOtherOwners() {
        String id = mapper.readTree(create(UUID.randomUUID().toString())).path("id").asString();
        StepVerifier.create(ReactiveSurveyIntegrationTest.asUser(UUID.fromString(B),database.withUser(() ->
                database.client().sql("SELECT id FROM public.survey_submissions_v2 WHERE id = :id")
                        .bind("id",UUID.fromString(id)).map((row,meta)->row.get("id",UUID.class)).one())))
                .verifyComplete();
        StepVerifier.create(ReactiveSurveyIntegrationTest.asUser(UUID.fromString(A),database.withUser(() ->
                database.client().sql("UPDATE public.survey_submissions_v2 SET version = 99 WHERE id = :id")
                        .bind("id",UUID.fromString(id)).fetch().rowsUpdated())))
                .expectError().verify();
    }

}
