package tungtungball.healthmithbackend;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

import org.springframework.test.context.bean.override.mockito.MockitoBean;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.client.SurveySubmissionClient;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.dto.SurveySubmissionRequest;
import tungtungball.healthmithbackend.dto.SurveySubmissionResponse;
import org.springframework.http.HttpStatus;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.mockJwt;
import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.springSecurity;

/**
 * US-01 사전조사 제출 API의 인수 조건 테스트.
 * JWT principal·저장 클라이언트는 대역이다. 서명 검증은 별도 smoke, 실제 RLS는 별도 환경에서 확인한다.
 */
@SpringBootTest
class Us01SurveySubmissionTest {

    private static final String ENDPOINT = "/api/survey-submissions";
    private static final String NO_LIMITATIONS = "\"physical_limitations\":{"
            + "\"present\":false,\"body_parts\":[]}";
    private static final String PRIORITY_PARTS = "\"priority_body_parts\":[\"하체\",\"상체\"]";

    @Autowired
    private ApplicationContext context;

    private static final UUID USER_ID = UUID.fromString("20000000-0000-4000-8000-000000000001");
    private static final UUID SUBMISSION_ID = UUID.fromString("10000000-0000-4000-8000-000000000001");

    @MockitoBean
    private SurveySubmissionClient storage;

    private WebTestClient client;

    @BeforeEach
    void setUp() {
        when(storage.insert(any(UUID.class), anyString(), any(SurveySubmissionRequest.Answers.class)))
                .thenAnswer(invocation -> Mono.just(new SurveySubmissionResponse(
                        SUBMISSION_ID, invocation.getArgument(2), "prepared", Instant.parse("2026-11-03T01:00:00Z"))));
        client = WebTestClient.bindToApplicationContext(context)
                .apply(springSecurity())
                .configureClient()
                .build();
    }

    @Test
    @DisplayName("US-01 (정상) 제약 없음과 유효 입력을 제출하면 저장 준비 상태로 응답한다")
    void validSubmissionWithoutLimitationsIsPrepared() {
        post(validAnswers(NO_LIMITATIONS, purpose("체력", "null"), "5", PRIORITY_PARTS))
                .expectStatus().isCreated()
                .expectBody()
                .jsonPath("$.id").exists()
                .jsonPath("$.answers.physical_limitations.present").isEqualTo(false)
                .jsonPath("$.answers.purpose.type").isEqualTo("체력")
                .jsonPath("$.answers.intensity").isEqualTo(5)
                .jsonPath("$.answers.priority_body_parts[0]").isEqualTo("하체")
                .jsonPath("$.generation_request_status").isEqualTo("prepared")
                .jsonPath("$.user_id").doesNotExist();
    }

    @Test
    @DisplayName("US-01 (정상) 제약 부위와 우선 부위를 별도 필드와 입력 순서로 보존한다")
    void limitationAndPriorityPartsRemainSeparateAndOrdered() {
        String limitations = "\"physical_limitations\":{"
                + "\"present\":true,\"body_parts\":[\"허리\"]}";
        String priorities = "\"priority_body_parts\":[\"상체\",\"하체\"]";

        post(validAnswers(limitations, purpose("근력", "null"), "5", priorities))
                .expectStatus().isCreated()
                .expectBody()
                .jsonPath("$.answers.physical_limitations.body_parts[0]").isEqualTo("허리")
                .jsonPath("$.answers.priority_body_parts[0]").isEqualTo("상체")
                .jsonPath("$.answers.priority_body_parts[1]").isEqualTo("하체")
                .jsonPath("$.generation_request_status").isEqualTo("prepared");
    }

    @ParameterizedTest
    @ValueSource(strings = {"체력", "감량", "근력", "자세", "자유 입력"})
    @DisplayName("US-01 (정상) 허용된 운동 목적을 제출할 수 있다")
    void supportedPurposeCanBeSubmitted(String type) {
        String customText = "자유 입력".equals(type) ? quote("오래 걷고 싶다") : "null";

        post(validAnswers(NO_LIMITATIONS, purpose(type, customText), "5", PRIORITY_PARTS))
                .expectStatus().isCreated()
                .expectBody()
                .jsonPath("$.answers.purpose.type").isEqualTo(type)
                .jsonPath("$.answers.purpose.custom_text").isEqualTo("자유 입력".equals(type)
                        ? "오래 걷고 싶다" : null);
    }

    @Test
    @DisplayName("US-01 (정상) 자유 입력 목적 문장의 원문을 보존한다")
    void freeTextPurposePreservesOriginalText() {
        String original = "  오래 걷고 싶다  ";

        post(validAnswers(NO_LIMITATIONS, purpose("자유 입력", quote(original)), "5", PRIORITY_PARTS))
                .expectStatus().isCreated()
                .expectBody()
                .jsonPath("$.answers.purpose.custom_text").isEqualTo(original)
                .jsonPath("$.generation_request_status").isEqualTo("prepared");
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 10})
    @DisplayName("US-01 (정상·경계) 강도 경계값 1과 10을 각각 제출할 수 있다")
    void intensityBoundaryCanBeSubmitted(int intensity) {
        post(validAnswers(NO_LIMITATIONS, purpose("체력", "null"), Integer.toString(intensity), PRIORITY_PARTS))
                .expectStatus().isCreated()
                .expectBody()
                .jsonPath("$.answers.intensity").isEqualTo(intensity);
    }

    @Test
    @DisplayName("US-01 (실패·거절) 강도가 누락되면 입력 오류를 반환한다")
    void missingIntensityIsRejected() {
        String answers = NO_LIMITATIONS + "," + purpose("체력", "null") + "," + PRIORITY_PARTS;

        expectInvalidInput(answers, "answers.intensity");
    }

    @Test
    @DisplayName("US-01 (실패·거절) 강도 0은 입력 오류로 거절한다")
    void zeroIntensityIsRejected() {
        expectInvalidInput(validAnswers(NO_LIMITATIONS, purpose("체력", "null"), "0", PRIORITY_PARTS),
                "answers.intensity");
    }

    @Test
    @DisplayName("US-01 (실패·거절) 강도 11은 입력 오류로 거절한다")
    void intensityAboveMaximumIsRejected() {
        expectInvalidInput(validAnswers(NO_LIMITATIONS, purpose("체력", "null"), "11", PRIORITY_PARTS),
                "answers.intensity");
    }

    @Test
    @DisplayName("US-01 (실패·거절) 운동 목적이 누락되면 입력 오류를 반환한다")
    void missingPurposeIsRejected() {
        String answers = NO_LIMITATIONS + ",\"purpose\":{\"custom_text\":null},\"intensity\":5," + PRIORITY_PARTS;

        expectInvalidInput(answers, "answers.purpose.type");
    }

    @Test
    @DisplayName("US-01 (실패·거절) 자유 입력 목적이 공백뿐이면 입력 오류로 거절한다")
    void blankFreeTextPurposeIsRejected() {
        expectInvalidInput(validAnswers(NO_LIMITATIONS, purpose("자유 입력", quote("   \t  ")),
                "5", PRIORITY_PARTS), "answers.purpose.custom_text");
    }

    @Test
    @DisplayName("US-01 (실패·거절) 신체 제약이 있는데 부위가 비어 있으면 입력 오류로 거절한다")
    void emptyLimitationPartsAreRejected() {
        String limitations = "\"physical_limitations\":{"
                + "\"present\":true,\"body_parts\":[]}";

        expectInvalidInput(validAnswers(limitations, purpose("체력", "null"), "5", PRIORITY_PARTS),
                "answers.physical_limitations.body_parts");
    }

    @Test
    @DisplayName("US-01 (실패·거절) 제약이 없는데 제약 부위가 있으면 모순 입력을 거절한다")
    void limitationPartsWithoutLimitationAreRejected() {
        String limitations = "\"physical_limitations\":{"
                + "\"present\":false,\"body_parts\":[\"허리\"]}";

        expectInvalidInput(validAnswers(limitations, purpose("체력", "null"), "5", PRIORITY_PARTS),
                "answers.physical_limitations.body_parts");
    }

    @Test
    @DisplayName("US-01 (실패·거절) 신체 제약 부위와 우선 부위가 겹치면 제출을 거절한다")
    void overlappingPartsAreRejected() {
        String limitations = "\"physical_limitations\":{"
                + "\"present\":true,\"body_parts\":[\"허리\"]}";
        String priorities = "\"priority_body_parts\":[\"허리\",\"하체\"]";

        post(validAnswers(limitations, purpose("체력", "null"), "5", priorities))
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.code").isEqualTo("INVALID_SURVEY")
                .jsonPath("$.field_errors[0].field").isEqualTo("answers.priority_body_parts")
                .jsonPath("$.field_errors[0].code").isEqualTo("BODY_PART_CONFLICT");
        verifyNoInteractions(storage);
    }

    @Test
    @DisplayName("US-01 (권한) 인증이 없으면 저장을 호출하지 않는다")
    void unauthenticatedRequestDoesNotWrite() {
        client.post().uri(ENDPOINT).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"answers\":{" + validAnswers(NO_LIMITATIONS, purpose("체력", "null"), "5", PRIORITY_PARTS) + "}}")
                .exchange().expectStatus().isUnauthorized()
                .expectBody().jsonPath("$.code").isEqualTo("UNAUTHORIZED");
        verifyNoInteractions(storage);
    }

    @Test
    @DisplayName("US-01 (정상) JWT 소유자와 토큰을 한 번의 저장에 전달한다")
    void validatedOwnerAndTokenArePassedToStorage() {
        post(validAnswers(NO_LIMITATIONS, purpose("체력", "null"), "5", PRIORITY_PARTS))
                .expectStatus().isCreated();
        verify(storage).insert(eq(USER_ID), eq("token"), any(SurveySubmissionRequest.Answers.class));
        verifyNoMoreInteractions(storage);
    }

    @Test
    @DisplayName("US-01 (실패·거절) 저장 실패를 prepared 성공으로 응답하지 않는다")
    void storageFailureIsNotPrepared() {
        when(storage.insert(any(), anyString(), any())).thenReturn(Mono.error(new ApiException(
                HttpStatus.INTERNAL_SERVER_ERROR, "SAVE_FAILED", "저장 실패", List.of())));
        post(validAnswers(NO_LIMITATIONS, purpose("체력", "null"), "5", PRIORITY_PARTS))
                .expectStatus().is5xxServerError()
                .expectBody().jsonPath("$.code").isEqualTo("SAVE_FAILED")
                .jsonPath("$.generation_request_status").doesNotExist();
        verify(storage).insert(eq(USER_ID), eq("token"), any(SurveySubmissionRequest.Answers.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"\"5\"", "5.0", "5.5", "true", "null"})
    @DisplayName("US-01 (실패·거절) 강도의 타입을 자동 변환하지 않는다")
    void invalidIntensityTypesDoNotWrite(String intensity) {
        expectInvalidInput(validAnswers(NO_LIMITATIONS, purpose("체력", "null"), intensity, PRIORITY_PARTS),
                "answers.intensity");
    }

    @Test
    @DisplayName("US-01 (실패·거절) 소유자 주입을 거절하고 저장하지 않는다")
    void injectedOwnerDoesNotWrite() {
        post(validAnswers(NO_LIMITATIONS, purpose("체력", "null"), "5", PRIORITY_PARTS)
                + ",\"user_id\":\"20000000-0000-4000-8000-000000000002\"")
                .expectStatus().isBadRequest()
                .expectBody().jsonPath("$.code").isEqualTo("INVALID_SURVEY");
        verifyNoInteractions(storage);
    }

    private WebTestClient.ResponseSpec post(String answers) {
        return client.mutateWith(mockJwt().jwt(jwt -> jwt.subject(USER_ID.toString())))
                .post().uri(ENDPOINT)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"answers\":{" + answers + "}}")
                .exchange();
    }

    private void expectInvalidInput(String answers, String field) {
        post(answers)
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.code").isEqualTo("INVALID_SURVEY")
                .jsonPath("$.field_errors").isArray()
                .jsonPath("$.field_errors").isNotEmpty()
                .jsonPath("$.field_errors[0].field").isEqualTo(field)
                .jsonPath("$.field_errors[0].code").isEqualTo("INVALID_INPUT")
                .jsonPath("$.generation_request_status").doesNotExist();
        verifyNoInteractions(storage);
    }

    private static String validAnswers(String limitations, String purpose, String intensity, String priorityParts) {
        return limitations + "," + purpose + ",\"intensity\":" + intensity + "," + priorityParts;
    }

    private static String purpose(String type, String customText) {
        return "\"purpose\":{\"type\":" + quote(type) + ",\"custom_text\":" + customText + "}";
    }

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r") + "\"";
    }
}
