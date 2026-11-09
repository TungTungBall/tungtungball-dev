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
class ReactiveWorkoutIntegrationTest extends PostgresIntegrationSupport {
    static final String A = "20000000-0000-4000-8000-000000000001";
    static final String B = "20000000-0000-4000-8000-000000000002";
    @Autowired ApplicationContext context;
    @Autowired JsonMapper mapper;
    @Autowired WorkerDatabase worker;
    WebTestClient http;
    UUID workerId;

    @BeforeEach
    void setUp() throws Exception {
        ADMIN.sql(Files.readString(Path.of("src/test/resources/db/workout-fixtures.sql"))).then().block(Duration.ofSeconds(10));
        workerId = UUID.randomUUID();
        worker.generation("poll", workerId, 300, Map.of()).block(Duration.ofSeconds(10));
        http = WebTestClient.bindToApplicationContext(context).apply(springSecurity()).configureClient().build();
    }

    JsonNode request(String user, HttpMethod method, String path, Object body, String key, int status) {
        var request = http.mutateWith(mockJwt().jwt(jwt -> jwt.subject(user))).method(method).uri(path);
        if (key != null) { request.header("Idempotency-Key", key); }
        if (body != null) { request.contentType(MediaType.APPLICATION_JSON).bodyValue(mapper.writeValueAsString(body)); }
        return mapper.readTree(request.exchange().expectStatus().isEqualTo(status).expectBody(String.class).returnResult().getResponseBody());
    }

    JsonNode get(String path) { return request(A, HttpMethod.GET, path, null, null, 200); }
    JsonNode post(String path, Object body, int status) {
        return request(A, HttpMethod.POST, path, body, UUID.randomUUID().toString(), status);
    }
    JsonNode answers() {
        return mapper.readTree("""
            {"physical_limitations":{"present":false,"body_parts":[]},"purpose":{"type":"체력","custom_text":null},"intensity":5,"priority_body_parts":["하체","상체"]}
            """);
    }

    JsonNode generatedCurriculum() {
        JsonNode survey = post("/api/survey-submissions", Map.of("answers", answers()), 201);
        String submission = survey.path("id").asString();
        get("/api/survey-submissions/" + submission);
        request(A, HttpMethod.PATCH, "/api/survey-submissions/" + submission,
                Map.of("answers", answers(), "expected_version", 1), UUID.randomUUID().toString(), 200);
        assertEquals("TEST_EX", get("/api/exercises").path("items").get(0).path("id").asString());
        String key = UUID.randomUUID().toString();
        JsonNode job = request(A, HttpMethod.POST, "/api/curriculum-generation-requests", Map.of("survey_submission_id", submission), key, 202);
        assertEquals(job, request(A, HttpMethod.POST, "/api/curriculum-generation-requests", Map.of("survey_submission_id", submission), key, 202));
        request(B, HttpMethod.GET, "/api/curriculum-generation-requests/" + job.path("id").asString(), null, null, 404);
        JsonNode claimed = worker.generation("poll", workerId, 300, Map.of()).block();
        var stages = mapper.createArrayNode();
        String[] names = {"광석 채굴", "광석 쪼개기", "광석 세척", "광석 가공", "보석 연마"};
        for (int i = 0; i < 5; i++) {
            stages.addObject().put("stage_index", i + 1).put("stage_name", names[i]).put("exercise_id", "TEST_EX")
                    .put("exercise_name", "테스트 운동").put("target_repetitions", 1).put("pace_instruction", "테스트 속도")
                    .put("internal_focus_instruction", "테스트 집중 안내");
        }
        assertTrue(worker.generation("publish_curriculum", workerId, 300,
                Map.of("request_id", claimed.path("request_id"), "lease_token", claimed.path("lease_token"), "stages", stages)).block().asBoolean());
        JsonNode completed = get("/api/curriculum-generation-requests/" + job.path("id").asString());
        assertEquals("succeeded", completed.path("status").asString());
        return get("/api/curricula/" + completed.path("curriculum_id").asString());
    }

    JsonNode completedWorkout() {
        JsonNode curriculum = generatedCurriculum();
        String cid = curriculum.path("id").asString();
        JsonNode confirmed = post("/api/curricula/" + cid + "/confirmations", Map.of("expected_version", curriculum.path("version")), 200);
        JsonNode session = post("/api/workout-sessions", Map.of("curriculum_id", cid, "expected_curriculum_version", confirmed.path("version")), 201);
        String id = session.path("id").asString();
        JsonNode paused = post("/api/workout-sessions/" + id + "/pause", Map.of("expected_version", session.path("version"), "reason", "manual"), 200);
        session = post("/api/workout-sessions/" + id + "/resume", Map.of("expected_version", paused.path("version")), 200);
        assertEquals(id, get("/api/workout-sessions/current").path("session").path("id").asString());
        get("/api/workout-sessions/" + id);
        Object last = null;
        for (int stage = 1; stage <= 5; stage++) {
            last = Map.of("event_id", UUID.randomUUID().toString(), "stage_index", stage, "expected_version", session.path("version"));
            session = post("/api/workout-sessions/" + id + "/repetitions", last, 200).path("session");
        }
        assertEquals("completed", session.path("status").asString());
        assertFalse(post("/api/workout-sessions/" + id + "/repetitions", last, 200).path("event_applied").asBoolean());
        assertTrue(get("/api/workout-sessions/current").path("session").isNull());
        JsonNode result = get("/api/workout-sessions/" + id + "/result");
        get("/api/gems/" + result.path("gem").path("id").asString());
        assertEquals(1, get("/api/me/gems").path("items").size());
        return session;
    }

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
}
