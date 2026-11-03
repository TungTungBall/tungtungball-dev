package tungtungball.healthmithbackend;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.convention.TestBean;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.netty.DisposableServer;
import reactor.netty.http.server.HttpServer;
import tools.jackson.databind.json.JsonMapper;

import java.util.concurrent.ConcurrentLinkedQueue;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.mockJwt;
import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.springSecurity;

/** S03의 HTTP·RPC 계약 대역 검사. 거래와 RLS는 별도 PostgreSQL 검사로 확인한다. */
@SpringBootTest
class SurveySubmissionUpdateTest {
    private static final String ID = "10000000-0000-4000-8000-000000000001";
    private static final String OWNER = "20000000-0000-4000-8000-000000000001";
    private static final String KEY = "30000000-0000-4000-8000-000000000001";
    private static final String PATH = "/api/survey-submissions/";
    private static final String ANSWERS = """
            {"physical_limitations":{"present":false,"body_parts":[]},
             "purpose":{"type":"자유 입력","custom_text":"  오래 걷고 싶다  "},
             "intensity":10,"priority_body_parts":["하체","상체"]}
            """;
    private static final String BODY = "{\"answers\":" + ANSWERS + ",\"expected_version\":1}";
    private static final String ROW = "{\"id\":\"" + ID + "\",\"answers\":" + ANSWERS
            + ",\"generation_request_status\":\"prepared\",\"created_at\":\"2026-11-03T01:00:00Z\",\"version\":2}";
    private static final String SUCCESS = "{\"outcome\":\"UPDATED\",\"submission\":" + ROW + "}";
    private static final ConcurrentLinkedQueue<Received> RECEIVED = new ConcurrentLinkedQueue<>();
    private static volatile String reply = SUCCESS;
    private static volatile int status = 200;
    private static final DisposableServer DATA_API = HttpServer.create().host("127.0.0.1").port(0)
            .handle((request, response) -> request.receive().aggregate().asString().flatMap(body -> {
                RECEIVED.add(new Received(request.method().name(), request.uri(),
                        request.requestHeaders().get("Authorization"), body));
                return response.status(status).header("Content-Type", "application/json")
                        .sendString(Mono.just(reply)).then();
            })).bindNow();

    @TestBean(methodName = "dataApiWebClient")
    private WebClient supabaseWebClient;

    @Autowired
    private ApplicationContext context;

    @Autowired
    private JsonMapper mapper;

    private WebTestClient client;

    static WebClient dataApiWebClient() {
        return WebClient.builder().baseUrl("http://127.0.0.1:" + DATA_API.port() + "/rest/v1")
                .defaultHeader("apikey", "synthetic-publishable-key").build();
    }

    @BeforeEach
    void setUp() {
        reply = SUCCESS;
        status = 200;
        RECEIVED.clear();
        client = WebTestClient.bindToApplicationContext(context).apply(springSecurity()).configureClient().build();
    }

    @AfterAll
    static void stopDataApi() {
        DATA_API.disposeNow();
    }

    @Test
    @DisplayName("US-01 (정상) 수정은 사용자 JWT와 검증한 전체 입력으로 제한 RPC를 한 번 호출한다")
    void validUpdatePreservesContract() {
        patch(ID, KEY, BODY).expectStatus().isOk().expectBody()
                .jsonPath("$.version").isEqualTo(2)
                .jsonPath("$.answers.purpose.custom_text").isEqualTo("  오래 걷고 싶다  ")
                .jsonPath("$.answers.priority_body_parts[0]").isEqualTo("하체")
                .jsonPath("$.user_id").doesNotExist();
        assertEquals(1, RECEIVED.size());
        Received rpc = RECEIVED.element();
        assertEquals("POST", rpc.method());
        assertEquals("/rest/v1/rpc/update_survey_submission", rpc.uri());
        assertEquals("Bearer token", rpc.authorization());
        var body = mapper.readTree(rpc.body());
        assertEquals(4, body.size());
        assertEquals(ID, body.get("p_submission_id").asString());
        assertEquals(KEY, body.get("p_idempotency_key").asString());
        assertEquals(1, body.get("p_expected_version").asInt());
        assertEquals(mapper.readTree(ANSWERS), body.get("p_answers"));
        assertFalse(body.has("user_id"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"VERSION_CONFLICT", "INVALID_STATE", "IDEMPOTENCY_CONFLICT"})
    @DisplayName("US-01 (실패·거절) 상태·버전·멱등성 충돌은 409로 전달한다")
    void conflictsAreNotSuccessfulUpdates(String code) {
        reply = "{\"outcome\":\"" + code + "\",\"submission\":null}";
        patch(ID, KEY, BODY).expectStatus().isEqualTo(409).expectBody()
                .jsonPath("$.code").isEqualTo(code).jsonPath("$.version").doesNotExist();
    }

    @Test
    @DisplayName("US-01 (권한) DB의 타인·없음 결과는 동일한 404 계약이다")
    void missingOrForeignRecordIsNotFound() {
        reply = "{\"outcome\":\"RESOURCE_NOT_FOUND\",\"submission\":null}";
        patch(ID, KEY, BODY).expectStatus().isNotFound().expectBody()
                .jsonPath("$.code").isEqualTo("RESOURCE_NOT_FOUND");
    }

    @Test
    @DisplayName("US-01 (권한) 인증 없는 수정은 RPC 호출 전에 거절한다")
    void missingAuthenticationDoesNotCallRpc() {
        client.patch().uri(PATH + ID).header("Idempotency-Key", KEY).contentType(MediaType.APPLICATION_JSON)
                .bodyValue(BODY).exchange().expectStatus().isUnauthorized();
        assertTrue(RECEIVED.isEmpty());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "invalid", "1-1-1-1-1"})
    @DisplayName("US-01 (실패·거절) 멱등성 키가 없거나 UUID가 아니면 RPC를 호출하지 않는다")
    void invalidKeyDoesNotCallRpc(String key) {
        var request = client.mutateWith(mockJwt().jwt(jwt -> jwt.subject(OWNER))).patch().uri(PATH + ID);
        if (!key.isEmpty()) {
            request.header("Idempotency-Key", key);
        }
        request.contentType(MediaType.APPLICATION_JSON).bodyValue(BODY).exchange()
                .expectStatus().isBadRequest().expectBody().jsonPath("$.code").isEqualTo("INVALID_REQUEST");
        assertTrue(RECEIVED.isEmpty());
    }

    @Test
    @DisplayName("US-01 (실패·거절) 잘못된 경로 UUID는 RPC 호출 없이 거절한다")
    void invalidIdDoesNotCallRpc() {
        patch("invalid", KEY, BODY).expectStatus().isBadRequest();
        assertTrue(RECEIVED.isEmpty());
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "null", "\"1\"", "1.0", "true"})
    @DisplayName("US-01 (실패·거절) 수정 버전은 양의 정수만 받으며 자동 변환하지 않는다")
    void invalidVersionDoesNotCallRpc(String version) {
        patch(ID, KEY, BODY.replace("\"expected_version\":1", "\"expected_version\":" + version))
                .expectStatus().isBadRequest().expectBody().jsonPath("$.code").isEqualTo("INVALID_SURVEY");
        assertTrue(RECEIVED.isEmpty());
    }

    @Test
    @DisplayName("US-01 (실패·거절) 부분 answers는 병합하지 않고 거절한다")
    void partialAnswersAreRejected() {
        patch(ID, KEY, "{\"answers\":{\"intensity\":5},\"expected_version\":1}")
                .expectStatus().isBadRequest().expectBody().jsonPath("$.code").isEqualTo("INVALID_SURVEY");
        assertTrue(RECEIVED.isEmpty());
    }

    @Test
    @DisplayName("US-01 (실패·거절) 수정에도 S01 부위 충돌 검사를 적용한다")
    void conflictingBodyPartsDoNotCallRpc() {
        patch(ID, KEY, BODY.replace("\"present\":false,\"body_parts\":[]", "\"present\":true,\"body_parts\":[\"하체\"]"))
                .expectStatus().isBadRequest().expectBody().jsonPath("$.field_errors[0].code").isEqualTo("BODY_PART_CONFLICT");
        assertTrue(RECEIVED.isEmpty());
    }

    @Test
    @DisplayName("US-01 (실패·거절) 소유자 주입은 RPC 호출 없이 거절한다")
    void ownerInjectionIsRejected() {
        patch(ID, KEY, BODY.replace("\"expected_version\":1", "\"expected_version\":1,\"user_id\":\"" + OWNER + "\""))
                .expectStatus().isBadRequest().expectBody().jsonPath("$.code").isEqualTo("INVALID_SURVEY");
        assertTrue(RECEIVED.isEmpty());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "{}", "not-json", "null", "{\"outcome\":\"UNKNOWN\",\"submission\":null}",
            "{\"outcome\":\"UPDATED\",\"submission\":null}"})
    @DisplayName("US-01 (실패·거절) 비어 있거나 잘못된 RPC 결과는 저장 성공으로 인정하지 않는다")
    void malformedResultIsSaveFailed(String body) {
        reply = body;
        patch(ID, KEY, BODY).expectStatus().is5xxServerError().expectBody().jsonPath("$.code").isEqualTo("SAVE_FAILED");
    }

    @ParameterizedTest
    @ValueSource(strings = {"id", "version", "answers", "status"})
    @DisplayName("US-01 (실패·거절) RPC의 다른 리소스·버전·입력·상태를 성공으로 내보내지 않는다")
    void mismatchedResultIsSaveFailed(String field) {
        reply = switch (field) {
            case "id" -> SUCCESS.replace(ID, "10000000-0000-4000-8000-000000000002");
            case "version" -> SUCCESS.replace("\"version\":2", "\"version\":3");
            case "answers" -> SUCCESS.replace("\"intensity\":10", "\"intensity\":9");
            default -> SUCCESS.replace("prepared", "queued");
        };
        patch(ID, KEY, BODY).expectStatus().is5xxServerError().expectBody().jsonPath("$.code").isEqualTo("SAVE_FAILED");
    }

    @ParameterizedTest
    @ValueSource(ints = {401, 403, 404, 500, 503})
    @DisplayName("US-01 (실패·거절) RPC HTTP 장애는 내부 정보 없이 SAVE_FAILED로 응답한다")
    void rpcHttpFailureIsSaveFailed(int httpStatus) {
        status = httpStatus;
        reply = "{\"message\":\"private database detail\"}";
        patch(ID, KEY, BODY).expectStatus().is5xxServerError().expectBody().jsonPath("$.code").isEqualTo("SAVE_FAILED")
                .jsonPath("$.message").value(value -> assertFalse(value.toString().contains("private database detail")));
    }

    @Test
    @DisplayName("US-01 (정상) 허용 출처의 PATCH와 멱등성 헤더 preflight를 통과시킨다")
    void patchCorsPreflightIsAllowed() {
        client.options().uri("http://localhost:8080" + PATH + ID).header("Origin", "http://localhost:3000")
                .header("Access-Control-Request-Method", "PATCH")
                .header("Access-Control-Request-Headers", "authorization,content-type,idempotency-key")
                .exchange().expectStatus().isOk()
                .expectHeader().value("Access-Control-Allow-Methods", value -> assertTrue(value.contains("PATCH")));
        assertTrue(RECEIVED.isEmpty());
    }

    @Test
    @DisplayName("US-01 (권한) PATCH를 추가해도 허용하지 않은 출처는 거절한다")
    void unknownOriginRemainsRejected() {
        client.options().uri("http://localhost:8080" + PATH + ID).header("Origin", "https://untrusted.invalid")
                .header("Access-Control-Request-Method", "PATCH").exchange().expectStatus().isForbidden();
        assertTrue(RECEIVED.isEmpty());
    }

    private WebTestClient.ResponseSpec patch(String id, String key, String body) {
        return client.mutateWith(mockJwt().jwt(jwt -> jwt.subject(OWNER))).patch().uri(PATH + id)
                .header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange();
    }

    private record Received(String method, String uri, String authorization, String body) {
    }
}
