package tungtungball.healthmithbackend.repository;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import java.util.Map;
import java.util.UUID;
import java.nio.file.Files;
import java.nio.file.Path;
import tungtungball.healthmithbackend.config.GenerationWorkerProperties;
import tungtungball.healthmithbackend.service.GenerationWorkerService;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class GenerationSummaryPolicyIntegrationTest extends ReactiveApiIntegrationSupport {
    @Test
    void disabledSummaryTransferStillAllowsNextCurriculumWithoutCopyingSummary() {
        var completed = completedWorkout();
        ADMIN.sql("UPDATE private.runtime_policies SET value=jsonb_set(value,'{include_generated_summary}','false') WHERE name='generation_validation'")
                .then().block();
        ADMIN.sql("INSERT INTO public.workout_tendencies VALUES (:owner,'DO_NOT_TRANSMIT',now(),1)")
                .bind("owner", UUID.fromString(A)).then().block();
        var saved = post("/api/workout-sessions/" + completed.path("id").asString() + "/feedback",
                Map.of("soreness_body_parts", java.util.List.of("없음"), "difficulty", 3, "enjoyment", 4), 201);
        assertFalse(saved.path("next_generation_request_id").isNull());
        var claim = worker.generation("poll", workerId, 300, Map.of()).block();
        assertEquals("curriculum", claim.path("kind").asString());
        assertTrue(claim.path("snapshot").path("previous_stages").isArray());
        assertFalse(claim.path("snapshot").has("summary"));
        var service = new GenerationWorkerService(null, null, new GenerationWorkerProperties(false,null,null,null,null,null,null,null,null), mapper);
        var safe = service.safeInput(claim);
        assertTrue(safe.path("previous_curriculum").isArray());
        assertFalse(safe.has("latest_successful_summary"));
        assertFalse(safe.toString().contains("DO_NOT_TRANSMIT"));
    }

    @Test
    void suppliedMvpSeedCanBeAppliedTwiceWithoutDuplicateExercisesOrPolicies() throws Exception {
        String seed = Files.readString(Path.of("../supabase/seeds/mvp-workout-20261110.sql"));
        // migration의 트랜잭션과 독립적인 fixture다. BEGIN/COMMIT은 테스트 연결이 관리한다.
        seed = seed.replace("begin;", "").replace("commit;", "");
        ADMIN.sql(seed).then().block();
        ADMIN.sql(seed).then().block();
        assertEquals(3L, ADMIN.sql("SELECT count(*) AS n FROM public.exercise_catalog WHERE id IN ('squat','push_up','lunge') AND enabled")
                .map((r,m) -> r.get("n",Long.class)).one().block());
        assertEquals(2L, ADMIN.sql("SELECT count(*) AS n FROM private.runtime_policies WHERE name IN ('generation_validation','workout_start')")
                .map((r,m) -> r.get("n",Long.class)).one().block());
        assertEquals("false", ADMIN.sql("SELECT value->>'include_generated_summary' AS value FROM private.runtime_policies WHERE name='generation_validation'")
                .map((r,m) -> r.get("value",String.class)).one().block());
        assertEquals("true", ADMIN.sql("SELECT value->>'allow_reuse' AS value FROM private.runtime_policies WHERE name='workout_start'")
                .map((r,m) -> r.get("value",String.class)).one().block());
    }
}
