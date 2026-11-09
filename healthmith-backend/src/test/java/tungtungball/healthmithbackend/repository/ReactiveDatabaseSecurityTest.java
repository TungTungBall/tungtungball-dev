package tungtungball.healthmithbackend.repository;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import tungtungball.healthmithbackend.repository.r2dbc.UserDatabase;
import java.time.Duration;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class ReactiveDatabaseSecurityTest extends PostgresIntegrationSupport {
    @Autowired UserDatabase database;
    private static final UUID A = UUID.fromString("20000000-0000-4000-8000-000000000001");
    private static final UUID B = UUID.fromString("20000000-0000-4000-8000-000000000002");

    @Test
    void userConnectionCannotExecuteWorkerOrMutateServerTables() {
        for (String sql : new String[] {
                "SELECT public.combat_tick()",
                "SELECT public.generation_worker('poll',gen_random_uuid(),60,'{}')",
                "SELECT * FROM private.battles",
                "UPDATE public.survey_submissions SET version=version+1",
                "DELETE FROM public.survey_submissions"
        }) {
            StepVerifier.create(ReactiveSurveyIntegrationTest.asUser(A, database.withUser(() -> database.client().sql(sql).then())))
                    .expectError().verify(Duration.ofSeconds(10));
        }
    }

    @Test
    void concurrentSubscribersKeepIndependentTransactionLocalOwners() {
        StepVerifier.create(Flux.range(0, 30).flatMap(index -> {
            UUID expected = index % 2 == 0 ? A : B;
            return ReactiveSurveyIntegrationTest.asUser(expected, database.withUser(() -> database.client()
                    .sql("SELECT auth.uid() AS id, current_user AS role")
                    .map((row, metadata) -> {
                        assertEquals(expected, row.get("id", UUID.class));
                        assertEquals("authenticated", row.get("role", String.class));
                        return expected;
                    }).one()));
        }, 8)).expectNextCount(30).verifyComplete();
    }
}
