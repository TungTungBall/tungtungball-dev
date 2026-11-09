package tungtungball.healthmithbackend.repository;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.dto.*;
import tungtungball.healthmithbackend.repository.r2dbc.UserDatabase;
import java.util.List;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class ReactiveSurveyIntegrationTest extends PostgresIntegrationSupport {
    private static final UUID A = UUID.fromString("20000000-0000-4000-8000-000000000001");
    private static final UUID B = UUID.fromString("20000000-0000-4000-8000-000000000002");
    private static final SurveySubmissionRequest.Answers ANSWERS = new SurveySubmissionRequest.Answers(
            new SurveySubmissionRequest.PhysicalLimitations(false, List.of()),
            new SurveySubmissionRequest.Purpose("자유 입력", "  오래 걷고 싶다  "), 5, List.of("하체", "상체"));
    @Autowired SurveySubmissionStore store;
    @Autowired UserDatabase database;

    static <T> Mono<T> asUser(UUID owner, Mono<T> action) {
        Jwt jwt = Jwt.withTokenValue("synthetic-verified-principal").header("alg", "RS256")
                .subject(owner.toString()).build();
        return action.contextWrite(ReactiveSecurityContextHolder.withAuthentication(new JwtAuthenticationToken(jwt, List.of())));
    }

    @Test
    void ownedInsertReadUpdateAndReplayUseRealDatabase() {
        StepVerifier.create(asUser(A, store.insert(A, "unused", ANSWERS)).flatMap(saved -> {
            assertNotNull(saved.id()); assertNotNull(saved.createdAt()); assertEquals(ANSWERS, saved.answers());
            UUID key = UUID.randomUUID();
            var update = new SurveySubmissionUpdateRequest(ANSWERS, 1L);
            return asUser(A, store.find(saved.id(), A, "unused"))
                    .doOnNext(row -> assertEquals(1L, row.version()))
                    .then(asUser(A, store.update(saved.id(), key, update, "unused")))
                    .doOnNext(row -> assertEquals(2L, row.version()))
                    .flatMap(first -> asUser(A, store.update(saved.id(), key, update, "unused"))
                            .doOnNext(replayed -> assertEquals(first, replayed)));
        })).expectNextCount(1).verifyComplete();
    }

    @Test
    void ownershipCannotBeForgedEvenWithAnotherOwnerParameter() {
        var saved = asUser(A, store.insert(A, "unused", ANSWERS)).block();
        StepVerifier.create(asUser(B, store.find(saved.id(), A, "unused")))
                .expectErrorSatisfies(error -> assertEquals("RESOURCE_NOT_FOUND", ((ApiException) error).getCode())).verify();
        StepVerifier.create(asUser(B, store.insert(A, "unused", ANSWERS)))
                .expectErrorSatisfies(error -> assertEquals("SAVE_FAILED", ((ApiException) error).getCode())).verify();
    }

    @Test
    void pooledConnectionDoesNotLeakOwnerAndMissingPrincipalIsRejected() {
        StepVerifier.create(store.insert(A, "unverified-token", ANSWERS))
                .expectErrorSatisfies(error -> assertEquals("UNAUTHORIZED", ((ApiException) error).getCode())).verify();
        for (int i = 0; i < 8; i++) {
            UUID owner = i % 2 == 0 ? A : B;
            StepVerifier.create(asUser(owner, database.withUser(() -> database.client().sql("SELECT auth.uid() AS owner")
                    .map((row, metadata) -> row.get("owner", UUID.class)).one())))
                    .expectNext(owner).verifyComplete();
        }
    }

    @Test
    void failedTransactionRollsBackAndConnectionCanBeReused() {
        long before = ADMIN.sql("SELECT count(*) AS n FROM public.survey_submissions").map((row, metadata) -> row.get("n", Long.class)).one().block();
        StepVerifier.create(asUser(A, database.withUser(() -> store.insert(A, "unused", ANSWERS)
                        .flatMap(saved -> Mono.error(new IllegalStateException("rollback-probe"))))))
                .expectError().verify();
        assertEquals(before, ADMIN.sql("SELECT count(*) AS n FROM public.survey_submissions").map((row, metadata) -> row.get("n", Long.class)).one().block());
        StepVerifier.create(asUser(B, database.withUser(() -> database.client().sql("SELECT current_user AS role")
                .map((row, metadata) -> row.get("role", String.class)).one())))
                .expectNext("authenticated").verifyComplete();
    }
}
