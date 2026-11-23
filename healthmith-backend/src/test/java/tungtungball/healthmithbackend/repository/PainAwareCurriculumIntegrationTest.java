package tungtungball.healthmithbackend.repository;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import tungtungball.healthmithbackend.config.GenerationWorkerProperties;
import tungtungball.healthmithbackend.service.GenerationWorkerService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class PainAwareCurriculumIntegrationTest extends ReactiveApiIntegrationSupport {
    void classify(String tag) {
        ADMIN.sql("INSERT INTO private.exercise_motion_profiles VALUES ('TEST_EX',CAST(:tags AS jsonb)) ON CONFLICT(exercise_id) DO UPDATE SET motion_tags=EXCLUDED.motion_tags")
                .bind("tags", mapper.writeValueAsString(List.of(tag))).then().block();
    }

    JsonNode survey(String... pain) {
        var answers = (ObjectNode) answers();
        answers.set("pain_body_parts", mapper.valueToTree(List.of(pain)));
        return post("/api/survey-submissions", Map.of("answers", answers), 201);
    }

    JsonNode initial(JsonNode survey) {
        post("/api/curriculum-generation-requests", Map.of("survey_submission_id", survey.path("id")), 202);
        return worker.generation("poll", workerId, 300, Map.of()).block();
    }

    ArrayNode stages(JsonNode claim) {
        var stages = mapper.createArrayNode();
        var exercise = claim.path("candidates").get(0);
        String[] names = {"광석 채굴", "광석 쪼개기", "광석 세척", "광석 가공", "보석 연마"};
        for (int i = 0; i < 5; i++) stages.addObject().put("stage_index", i + 1).put("stage_name", names[i])
                .put("exercise_id", exercise.path("id").asText()).put("exercise_name", exercise.path("name").asText())
                .put("target_repetitions", 1).put("pace_instruction", "테스트 속도")
                .put("internal_focus_instruction", exercise.path("internal_focus_instruction").asText());
        return stages;
    }

    boolean publish(JsonNode claim, JsonNode stages) {
        return worker.generation("publish_curriculum", workerId, 300, Map.of("request_id", claim.path("request_id"),
                "lease_token", claim.path("lease_token"), "stages", stages)).block().asBoolean();
    }

    JsonNode published(JsonNode claim) {
        assertTrue(publish(claim, stages(claim)));
        var job = get("/api/curriculum-generation-requests/" + claim.path("request_id").asText());
        return get("/api/curricula/" + job.path("curriculum_id").asText());
    }

    @ParameterizedTest
    @CsvSource({"목,neck_load", "어깨,overhead_repetition", "팔꿈치 바깥쪽,strong_grip", "손목·손 저림,repeated_wrist_flexion",
            "허리,trunk_load", "고관절·엉덩이 바깥쪽,hip_load", "무릎 앞쪽,knee_flexion", "발뒤꿈치 위쪽,calf_load", "발바닥·뒤꿈치 아래쪽,foot_load"})
    void allNineLocationsConstrainRelatedMotionsWithoutSendingHealthAnswers(String pain, String tag) {
        classify(tag);
        var survey = survey(pain);
        assertEquals(pain, get("/api/survey-submissions/" + survey.path("id").asText()).path("answers").path("pain_body_parts").get(0).asText());
        var claim = initial(survey);
        assertEquals(1, claim.path("policy").path("repetition_limits").path("TEST_EX").path("max").asInt());
        assertTrue(claim.path("candidates").get(0).path("internal_focus_instruction").asText().contains("편안한 범위"));
        assertFalse(claim.path("snapshot").has("pain_body_parts"));
        var service = new GenerationWorkerService(null, null, new GenerationWorkerProperties(false,null,null,null,null,null,null,null,null), mapper);
        var safe = service.safeInput(claim);
        assertFalse(safe.has("pain_body_parts"));
        assertFalse(safe.toString().contains(pain));
        assertFalse(safe.toString().contains("reference_condition"));
        assertFalse(safe.toString().contains("source_url"));
    }

    @Test
    void reducedLimitsAndInstructionsAreEnforcedForInitialRegenerationAndNext() {
        classify("knee_flexion");
        var claim = initial(survey("무릎 앞쪽", "발뒤꿈치 위쪽"));
        var invalid = stages(claim);
        ((ObjectNode) invalid.get(0)).put("target_repetitions", 5);
        assertFalse(publish(claim, invalid));
        invalid = stages(claim);
        ((ObjectNode) invalid.get(0)).put("internal_focus_instruction", "테스트 집중 안내");
        assertFalse(publish(claim, invalid));
        var draft = published(claim);
        post("/api/curricula/" + draft.path("id").asText() + "/regenerations", Map.of("expected_version", draft.path("version")), 202);
        claim = worker.generation("poll", workerId, 300, Map.of()).block();
        assertEquals(1, claim.path("policy").path("repetition_limits").path("TEST_EX").path("max").asInt());
        draft = published(claim);
        var confirmed = post("/api/curricula/" + draft.path("id").asText() + "/confirmations", Map.of("expected_version", draft.path("version")), 200);
        var session = post("/api/workout-sessions", Map.of("curriculum_id", draft.path("id"), "expected_curriculum_version", confirmed.path("version")), 201);
        for (int index = 1; index <= 5; index++) session = post("/api/workout-sessions/" + session.path("id").asText() + "/repetitions",
                Map.of("event_id", UUID.randomUUID().toString(), "stage_index", index, "expected_version", session.path("version")), 200).path("session");
        post("/api/workout-sessions/" + session.path("id").asText() + "/feedback", Map.of("soreness_body_parts", List.of("없음"), "difficulty", 1, "enjoyment", 5), 201);
        claim = worker.generation("poll", workerId, 300, Map.of()).block();
        // 쉬웠다는 피드백도 최초 설문의 동작 부하 제한을 풀지 못한다.
        assertEquals(1, claim.path("policy").path("repetition_limits").path("TEST_EX").path("max").asInt());
        assertTrue(claim.path("snapshot").has("previous_stages"));
        assertTrue(publish(claim, stages(claim)));
    }

    @Test
    void noPainAndUnrelatedMotionsRetainOriginalLimits() {
        var noPain = initial(survey());
        assertEquals(5, noPain.path("policy").path("repetition_limits").path("TEST_EX").path("max").asInt());
        published(noPain);
        classify("knee_flexion");
        var unrelated = initial(survey("손목·손 저림"));
        assertEquals(5, unrelated.path("policy").path("repetition_limits").path("TEST_EX").path("max").asInt());
        assertEquals("테스트 집중 안내", unrelated.path("candidates").get(0).path("internal_focus_instruction").asText());
    }

    @Test
    void rejectsUnclassifiedExercisesAndInvalidPainWithoutClaimingSurvey() {
        ADMIN.sql("DELETE FROM private.exercise_motion_profiles WHERE exercise_id='TEST_EX'").then().block();
        var saved = survey("무릎 앞쪽");
        post("/api/curriculum-generation-requests", Map.of("survey_submission_id", saved.path("id")), 409);
        assertEquals(0L, ADMIN.sql("SELECT count(*) AS n FROM public.survey_submissions WHERE generation_claimed_at IS NOT NULL")
                .map((row, metadata) -> row.get("n", Long.class)).one().block());
        for (List<String> pain : List.of(List.of("무릎"), List.of("목", "목"))) {
            var answers = (ObjectNode) answers(); answers.set("pain_body_parts", mapper.valueToTree(pain));
            post("/api/survey-submissions", Map.of("answers", answers), 400);
            assertFalse(ADMIN.sql("SELECT private.is_valid_survey_answers(CAST(:answers AS jsonb)) AS valid")
                    .bind("answers", answers.toString()).map((row, metadata) -> row.get("valid", Boolean.class)).one().block());
        }
        var answers = (ObjectNode) answers(); answers.set("pain_body_parts", mapper.valueToTree(List.of("허리")));
        var updated = request(activeUser, HttpMethod.PATCH, "/api/survey-submissions/" + saved.path("id").asText(),
                Map.of("answers", answers, "expected_version", 1), UUID.randomUUID().toString(), 200);
        assertEquals("허리", updated.path("answers").path("pain_body_parts").get(0).asText());
    }
}
