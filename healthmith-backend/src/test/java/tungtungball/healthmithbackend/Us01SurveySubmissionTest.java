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

import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.mockUser;
import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.springSecurity;

/**
 * US-01 사전조사 제출 API의 인수 조건 테스트.
 * 실제 Supabase JWT와 RLS는 테스트 계정이 준비된 별도 검증에서 다룬다.
 */
@SpringBootTest
class Us01SurveySubmissionTest {

    private static final String ENDPOINT = "/api/survey-submissions";
    private static final String NO_LIMITATIONS = "\"physical_limitations\":{"
            + "\"present\":false,\"body_parts\":[]}";
    private static final String PRIORITY_PARTS = "\"priority_body_parts\":[\"하체\",\"상체\"]";

    @Autowired
    private ApplicationContext context;

    private WebTestClient client;

    @BeforeEach
    void setUp() {
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
        String customText = "자유 입력".equals(type) ? "오래 걷고 싶다" : "null";

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
        String answers = NO_LIMITATIONS + ",\"intensity\":5," + PRIORITY_PARTS;

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
    }

    private WebTestClient.ResponseSpec post(String answers) {
        return client.mutateWith(mockUser())
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
    }

    private static String validAnswers(String limitations, String purpose, String intensity, String priorityParts) {
        return limitations + "," + purpose + ",\"intensity\":" + intensity + "," + priorityParts;
    }

    private static String purpose(String type, String customText) {
        return "\"purpose\":{\"type\":" + quote(type) + ",\"custom_text\":" + customText + "}";
    }

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
}
