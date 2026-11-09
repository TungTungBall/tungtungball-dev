package tungtungball.healthmithbackend.repository;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.dto.SurveySubmissionRequest;
import tungtungball.healthmithbackend.dto.SurveySubmissionUpdateRequest;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static tungtungball.healthmithbackend.repository.ReactiveSurveyIntegrationTest.asUser;

/** 서로 다른 실제 DB 연결에서 재전송·버전 경합·생성 잠금의 저장 불변성을 확인한다. */
@SpringBootTest
class SurveyUpdateAtomicityTest extends PostgresIntegrationSupport {
    private static final UUID OWNER = UUID.fromString("20000000-0000-4000-8000-000000000001");
    private static final UUID OTHER = UUID.fromString("20000000-0000-4000-8000-000000000002");
    private static final Duration TIMEOUT = Duration.ofSeconds(10);
    private static final SurveySubmissionRequest.Answers ANSWERS = answers(5);

    @Autowired SurveySubmissionStore store;

    @Test
    void concurrentReplayChangesTheVersionAndWritesTheReceiptOnlyOnce() {
        var saved = run(store.insert(OWNER, "unused", ANSWERS));
        UUID key = UUID.randomUUID();
        var request = new SurveySubmissionUpdateRequest(answers(6), 1L);

        var results = run(Mono.zip(store.update(saved.id(), key, request, "unused"),
                store.update(saved.id(), key, request, "unused")));

        assertEquals(results.getT1(), results.getT2());
        assertEquals(2L, results.getT1().version());
        assertEquals(results.getT1(), run(store.find(saved.id(), OWNER, "unused")));
        assertEquals(1L, receiptCount(saved.id()));
    }

    @Test
    void concurrentDifferentKeysCannotBothUpdateTheSameVersion() {
        var saved = run(store.insert(OWNER, "unused", ANSWERS));
        var request = new SurveySubmissionUpdateRequest(answers(6), 1L);
        var results = run(Mono.zip(
                store.update(saved.id(), UUID.randomUUID(), request, "unused").materialize(),
                store.update(saved.id(), UUID.randomUUID(), request, "unused").materialize()));
        var signals = List.of(results.getT1(), results.getT2());

        assertEquals(1L, signals.stream().filter(signal -> signal.isOnNext()).count());
        var failure = signals.stream().filter(signal -> signal.isOnError()).findFirst().orElseThrow();
        assertEquals("VERSION_CONFLICT", assertInstanceOf(ApiException.class, failure.getThrowable()).getCode());
        assertEquals(2L, run(store.find(saved.id(), OWNER, "unused")).version());
        assertEquals(1L, receiptCount(saved.id()));
    }

    @Test
    void changedBodyWithTheSameKeyDoesNotMutateTheSavedResult() {
        var saved = run(store.insert(OWNER, "unused", ANSWERS));
        UUID key = UUID.randomUUID();
        var first = run(store.update(saved.id(), key, new SurveySubmissionUpdateRequest(answers(6), 1L), "unused"));

        expectCode("IDEMPOTENCY_CONFLICT", store.update(saved.id(), key,
                new SurveySubmissionUpdateRequest(answers(7), 1L), "unused"));

        assertEquals(first, run(store.find(saved.id(), OWNER, "unused")));
        assertEquals(1L, receiptCount(saved.id()));
    }

    @Test
    void staleVersionAndForeignOwnerLeaveNoReceiptOrChangedAnswer() {
        var saved = run(store.insert(OWNER, "unused", ANSWERS));
        expectCode("VERSION_CONFLICT", store.update(saved.id(), UUID.randomUUID(),
                new SurveySubmissionUpdateRequest(answers(6), 2L), "unused"));
        ApiException foreign = assertThrows(ApiException.class, () -> asUser(OTHER,
                store.update(saved.id(), UUID.randomUUID(), new SurveySubmissionUpdateRequest(answers(6), 1L), "unused"))
                .block(TIMEOUT));
        assertEquals("RESOURCE_NOT_FOUND", foreign.getCode());

        var current = run(store.find(saved.id(), OWNER, "unused"));
        assertEquals(1L, current.version());
        assertEquals(ANSWERS, current.answers());
        assertEquals(0L, receiptCount(saved.id()));
    }

    @Test
    void generationLockRejectsNewUpdatesButKeepsTheOriginalReplay() {
        var saved = run(store.insert(OWNER, "unused", ANSWERS));
        UUID key = UUID.randomUUID();
        var request = new SurveySubmissionUpdateRequest(answers(6), 1L);
        var first = run(store.update(saved.id(), key, request, "unused"));
        ADMIN.sql("UPDATE public.survey_submissions SET generation_claimed_at=now() WHERE id=:id")
                .bind("id", saved.id()).then().block(TIMEOUT);

        expectCode("INVALID_STATE", store.update(saved.id(), UUID.randomUUID(),
                new SurveySubmissionUpdateRequest(answers(7), 2L), "unused"));
        assertEquals(first, run(store.update(saved.id(), key, request, "unused")));
        assertEquals(first, run(store.find(saved.id(), OWNER, "unused")));
        assertEquals(1L, receiptCount(saved.id()));
    }

    private <T> T run(Mono<T> action) { return asUser(OWNER, action).block(TIMEOUT); }

    private void expectCode(String code, Mono<?> action) {
        assertEquals(code, assertThrows(ApiException.class, () -> run(action)).getCode());
    }

    private long receiptCount(UUID submission) {
        return ADMIN.sql("SELECT count(*) AS n FROM private.survey_update_receipts WHERE submission_id=:id")
                .bind("id", submission).map((row, metadata) -> row.get("n", Long.class)).one().block(TIMEOUT);
    }

    private static SurveySubmissionRequest.Answers answers(int intensity) {
        return new SurveySubmissionRequest.Answers(
                new SurveySubmissionRequest.PhysicalLimitations(false, List.of()),
                new SurveySubmissionRequest.Purpose("체력", null), intensity, List.of("하체", "상체"));
    }
}
