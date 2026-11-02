package tungtungball.healthmithbackend;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.config.CorsProperties;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.config.error.ApiInputErrorCode;

import java.util.List;

import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.mockUser;
import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.springSecurity;

/**
 * API 공통 기반(이슈 #12)이 의도대로 동작하는지 확인하는 smoke 테스트.
 * 실제 기능 API 대신 이 테스트 안의 시험용 컨트롤러로 확인한다.
 */
@SpringBootTest
@Import(ApiCommonSmokeTest.SmokeController.class)
class ApiCommonSmokeTest {

    private static final String VALID_BODY = """
            {"answers":{"intensity":5,"custom_text":null,"priority_body_parts":["하체","상체"]}}""";

    @Autowired
    private ApplicationContext context;

    @Autowired
    private CorsProperties corsProperties;

    private WebTestClient client;

    @BeforeEach
    void setUp() {
        client = WebTestClient.bindToApplicationContext(context)
                .apply(springSecurity())
                .configureClient()
                .build();
    }

    private WebTestClient.ResponseSpec post(String path, String body) {
        return client.mutateWith(mockUser())
                .post().uri(path)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .exchange();
    }

    @Test
    @DisplayName("smoke: snake_case 입력을 읽고 snake_case로 응답하며, CSRF 토큰 없이 POST가 된다")
    void snakeCaseRoundTripWithoutCsrf() {
        post("/api/smoke/plain", VALID_BODY)
                .expectStatus().isCreated()
                .expectBody()
                .jsonPath("$.answers.priority_body_parts[0]").isEqualTo("하체")
                .jsonPath("$.answers.priorityBodyParts").doesNotExist();
    }

    @Test
    @DisplayName("smoke: 명시적인 null은 받는다")
    void explicitNullIsAccepted() {
        post("/api/smoke/plain", VALID_BODY).expectStatus().isCreated();
    }

    @Test
    @DisplayName("smoke: 정의하지 않은 필드는 400 INVALID_INPUT이고 경로를 알려 준다")
    void unknownFieldIsRejected() {
        post("/api/smoke/plain", """
                {"answers":{"intensity":5,"custom_text":null,"priority_body_parts":["하체"],"user_id":"x"}}""")
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.code").isEqualTo("INVALID_REQUEST")
                .jsonPath("$.field_errors[0].code").isEqualTo("INVALID_INPUT")
                .jsonPath("$.field_errors[0].field").isEqualTo("answers.user_id");
    }

    @Test
    @DisplayName("smoke: 문자열 숫자 \"5\"는 정수로 바꾸지 않고 거절한다")
    void stringNumberIsRejected() {
        post("/api/smoke/plain", """
                {"answers":{"intensity":"5","custom_text":null,"priority_body_parts":["하체"]}}""")
                .expectStatus().isBadRequest()
                .expectBody().jsonPath("$.field_errors[0].field").isEqualTo("answers.intensity");
    }

    @Test
    @DisplayName("smoke: 소수 5.5는 정수로 자르지 않고 거절한다")
    void floatIsRejected() {
        post("/api/smoke/plain", """
                {"answers":{"intensity":5.5,"custom_text":null,"priority_body_parts":["하체"]}}""")
                .expectStatus().isBadRequest();
    }

    @Test
    @DisplayName("smoke: boolean은 정수로 바꾸지 않고 거절한다")
    void booleanIsRejected() {
        post("/api/smoke/plain", """
                {"answers":{"intensity":true,"custom_text":null,"priority_body_parts":["하체"]}}""")
                .expectStatus().isBadRequest();
    }

    @Test
    @DisplayName("smoke: 숫자를 문자열 필드로 바꾸지 않고 거절한다")
    void numberToStringIsRejected() {
        post("/api/smoke/plain", """
                {"answers":{"intensity":5,"custom_text":5,"priority_body_parts":["하체"]}}""")
                .expectStatus().isBadRequest();
    }

    @Test
    @DisplayName("smoke: 키를 빠뜨리면 null과 구분해 거절한다")
    void missingKeyIsRejected() {
        post("/api/smoke/plain", """
                {"answers":{"intensity":5,"priority_body_parts":["하체"]}}""")
                .expectStatus().isBadRequest()
                .expectBody().jsonPath("$.code").isEqualTo("INVALID_REQUEST");
    }

    @Test
    @DisplayName("smoke: 깨진 JSON은 400 계약 형식이다")
    void malformedJsonIsRejected() {
        post("/api/smoke/plain", "{\"answers\":")
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.code").isEqualTo("INVALID_REQUEST")
                .jsonPath("$.field_errors").isArray();
    }

    @Test
    @DisplayName("smoke: @Valid 실패는 Java 경로를 snake_case JSON 경로로 바꾼다")
    void validationPathIsSnakeCase() {
        post("/api/smoke/plain", """
                {"answers":{"intensity":5,"custom_text":null,"priority_body_parts":[]}}""")
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.field_errors[0].field").isEqualTo("answers.priority_body_parts")
                .jsonPath("$.field_errors[0].code").isEqualTo("INVALID_INPUT");
    }

    @Test
    @DisplayName("smoke: @ApiInputErrorCode를 붙인 API는 그 코드를 최상위 code로 쓴다")
    void annotatedTopLevelCode() {
        post("/api/smoke/annotated", """
                {"answers":{"intensity":0,"custom_text":null,"priority_body_parts":["하체"]}}""")
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.code").isEqualTo("INVALID_SMOKE")
                .jsonPath("$.field_errors[0].field").isEqualTo("answers.intensity");
    }

    @Test
    @DisplayName("smoke: 인증이 없으면 401 계약 형식 JSON이다")
    void unauthorizedIsJson() {
        client.post().uri("/api/smoke/plain")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(VALID_BODY)
                .exchange()
                .expectStatus().isUnauthorized()
                .expectBody()
                .jsonPath("$.code").isEqualTo("UNAUTHORIZED")
                .jsonPath("$.field_errors").isEmpty();
    }

    @Test
    @DisplayName("smoke: 서버 코드가 던진 ApiException은 상태·코드를 그대로 쓴다")
    void apiExceptionPassesThrough() {
        client.mutateWith(mockUser()).get().uri("/api/smoke/save-failed").exchange()
                .expectStatus().isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR)
                .expectBody().jsonPath("$.code").isEqualTo("SAVE_FAILED");
    }

    @Test
    @DisplayName("smoke: 예상 못 한 예외는 500 INTERNAL_ERROR이고 내부 메시지를 내보내지 않는다")
    void unexpectedErrorIsHidden() {
        client.mutateWith(mockUser()).get().uri("/api/smoke/boom").exchange()
                .expectStatus().isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR)
                .expectBody()
                .jsonPath("$.code").isEqualTo("INTERNAL_ERROR")
                .jsonPath("$.message").isEqualTo("요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }

    @Test
    @DisplayName("smoke: 허용 출처 기본값이 설정에서 읽힌다")
    void corsPropertiesBound() {
        org.junit.jupiter.api.Assertions.assertEquals(List.of("http://localhost:3000"), corsProperties.allowedOrigins());
    }

    @Test
    @DisplayName("smoke: 허용한 출처의 CORS 사전 요청은 통과하고 다른 출처는 막는다")
    void corsPreflight() {
        // 실제 브라우저 요청처럼 호스트가 있는 주소로 보낸다. 상대 주소면 Spring이 출처를 비교하지 못해 403을 낸다.
        String url = "http://localhost:8080/api/smoke/plain";

        client.options().uri(url)
                .header(HttpHeaders.ORIGIN, "http://localhost:3000")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                .exchange()
                .expectStatus().isOk()
                .expectHeader().valueEquals(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:3000");

        client.options().uri(url)
                .header(HttpHeaders.ORIGIN, "http://evil.example")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                .exchange()
                .expectStatus().isForbidden()
                .expectHeader().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN);
    }

    record SmokeAnswers(
            @NotNull @Min(1) @Max(10) Integer intensity,
            String customText,
            @NotEmpty List<String> priorityBodyParts) {
    }

    record SmokeRequest(@NotNull @Valid SmokeAnswers answers) {
    }

    @RestController
    static class SmokeController {

        @PostMapping("/api/smoke/plain")
        @ResponseStatus(HttpStatus.CREATED)
        public Mono<SmokeRequest> plain(@Valid @RequestBody SmokeRequest request) {
            return Mono.just(request);
        }

        @ApiInputErrorCode("INVALID_SMOKE")
        @PostMapping("/api/smoke/annotated")
        @ResponseStatus(HttpStatus.CREATED)
        public Mono<SmokeRequest> annotated(@Valid @RequestBody SmokeRequest request) {
            return Mono.just(request);
        }

        @GetMapping("/api/smoke/save-failed")
        public Mono<String> saveFailed() {
            return Mono.error(new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "SAVE_FAILED",
                    "사전조사를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", List.of()));
        }

        @GetMapping("/api/smoke/boom")
        public Mono<String> boom() {
            return Mono.error(new IllegalStateException("secret-detail"));
        }
    }
}
