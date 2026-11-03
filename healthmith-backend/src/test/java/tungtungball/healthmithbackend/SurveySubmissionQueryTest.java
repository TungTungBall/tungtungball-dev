package tungtungball.healthmithbackend;

import io.netty.handler.codec.http.QueryStringDecoder;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.bean.override.convention.TestBean;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.netty.DisposableServer;
import reactor.netty.http.server.HttpServer;

import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.mockJwt;
import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.springSecurity;

/** S02 컨트롤러부터 HTTP 저장 대역까지 확인한다. 실제 Supabase JWT/RLS 확인과 구분한다. */
@SpringBootTest
class SurveySubmissionQueryTest {
    private static final String ID = "10000000-0000-4000-8000-000000000001";
    private static final String OWNER = "20000000-0000-4000-8000-000000000001";
    private static final String OTHER_OWNER = "20000000-0000-4000-8000-000000000002";
    private static final String PATH = "/api/survey-submissions/";
    private static final String ROW = """
            {"id":"10000000-0000-4000-8000-000000000001",
             "answers":{"physical_limitations":{"present":false,"body_parts":[]},
             "purpose":{"type":"자유 입력","custom_text":"  오래 걷고 싶다  "},
             "intensity":1,"priority_body_parts":["하체","상체"]},
             "generation_request_status":"prepared","created_at":"2026-11-03T01:00:00Z","version":7}
            """;
    private static final ConcurrentLinkedQueue<Received> RECEIVED = new ConcurrentLinkedQueue<>();
    private static volatile String mode = "ok";
    private static final DisposableServer DATA_API = HttpServer.create().host("127.0.0.1").port(0)
            .handle((request, response) -> {
                var query = new QueryStringDecoder(request.uri()).parameters();
                RECEIVED.add(new Received(request.method().name(), request.uri(), request.requestHeaders().get("Authorization")));
                String body = "[" + ROW + "]";
                int status = 200;
                if (mode.startsWith("http-")) {
                    status = Integer.parseInt(mode.substring(5));
                    body = "{\"message\":\"private upstream detail\"}";
                } else if (!List.of("eq." + OWNER).equals(query.get("user_id"))
                        || !List.of("eq." + ID).equals(query.get("id"))) {
                    body = "[]";
                } else {
                    body = switch (mode) {
                        case "empty-body" -> "";
                        case "invalid-json" -> "not-json";
                        case "null-row" -> "[null]";
                        case "multiple" -> "[" + ROW + "," + ROW + "]";
                        case "wrong-id" -> "[" + ROW.replace(ID, "10000000-0000-4000-8000-000000000002") + "]";
                        case "missing-version" -> "[" + ROW.replace(",\"version\":7", "") + "]";
                        case "zero-version" -> "[" + ROW.replace("\"version\":7", "\"version\":0") + "]";
                        case "null-version" -> "[" + ROW.replace("\"version\":7", "\"version\":null") + "]";
                        case "string-version" -> "[" + ROW.replace("\"version\":7", "\"version\":\"7\"") + "]";
                        case "wrong-status" -> "[" + ROW.replace("prepared", "queued") + "]";
                        default -> body;
                    };
                }
                return response.status(status).header("Content-Type", "application/json").sendString(Mono.just(body));
            }).bindNow();

    @TestBean(methodName = "dataApiWebClient")
    private WebClient supabaseWebClient;

    @Autowired
    private ApplicationContext context;

    private WebTestClient client;

    static WebClient dataApiWebClient() {
        return WebClient.builder().baseUrl("http://127.0.0.1:" + DATA_API.port() + "/rest/v1")
                .defaultHeader("apikey", "synthetic-publishable-key").build();
    }

    @BeforeEach
    void setUp() {
        mode = "ok";
        RECEIVED.clear();
        client = WebTestClient.bindToApplicationContext(context).apply(springSecurity()).configureClient().build();
    }

    @AfterAll
    static void stopDataApi() {
        DATA_API.disposeNow();
    }

    @Test
    @DisplayName("US-01 (정상) 본인 조회는 저장된 버전·자유 입력 원문·부위 순서를 보존한다")
    void ownerCanReadWithoutWriting() {
        get(OWNER, ID).expectStatus().isOk().expectBody()
                .jsonPath("$.id").isEqualTo(ID).jsonPath("$.version").isEqualTo(7)
                .jsonPath("$.answers.purpose.custom_text").isEqualTo("  오래 걷고 싶다  ")
                .jsonPath("$.answers.priority_body_parts[0]").isEqualTo("하체")
                .jsonPath("$.answers.priority_body_parts[1]").isEqualTo("상체")
                .jsonPath("$.user_id").doesNotExist();
        assertEquals(1, RECEIVED.size());
        Received request = RECEIVED.element();
        assertEquals("GET", request.method());
        assertEquals("Bearer token", request.authorization());
        var query = new QueryStringDecoder(request.uri()).parameters();
        assertEquals(List.of("eq." + OWNER), query.get("user_id"));
        assertEquals(List.of("eq." + ID), query.get("id"));
        assertEquals(List.of("id,answers,generation_request_status,created_at,version"), query.get("select"));
    }

    @Test
    @DisplayName("US-01 (권한) 타인 자료와 없는 자료는 같은 404이며 쓰기가 없다")
    void otherOwnerAndMissingRecordHaveSameResponse() {
        byte[] other = get(OTHER_OWNER, ID).expectStatus().isNotFound().expectBody().returnResult().getResponseBody();
        byte[] missing = get(OWNER, "10000000-0000-4000-8000-000000000099")
                .expectStatus().isNotFound().expectBody().returnResult().getResponseBody();
        assertArrayEquals(other, missing);
        assertEquals(2, RECEIVED.size());
        assertTrue(RECEIVED.stream().allMatch(request -> request.method().equals("GET")));
    }

    @Test
    @DisplayName("US-01 (권한) 인증 없이 조회하면 DB를 호출하지 않는다")
    void unauthenticatedReadDoesNotCallDataApi() {
        client.get().uri(PATH + ID).exchange().expectStatus().isUnauthorized()
                .expectBody().jsonPath("$.code").isEqualTo("UNAUTHORIZED");
        assertTrue(RECEIVED.isEmpty());
    }

    @ParameterizedTest
    @ValueSource(strings = {"not-a-uuid", "1-1-1-1-1", "10000000000040008000000000000001"})
    @DisplayName("US-01 (실패·거절) 잘못된 조회 식별자는 DB 호출 전에 거절한다")
    void invalidIdDoesNotCallDataApi(String id) {
        get(OWNER, id).expectStatus().isBadRequest().expectBody().jsonPath("$.code").isEqualTo("INVALID_REQUEST");
        assertTrue(RECEIVED.isEmpty());
    }

    @Test
    @DisplayName("US-01 (권한) JWT 소유자가 UUID가 아니면 DB 조회를 하지 않는다")
    void invalidJwtSubjectIsRejected() {
        get("invalid-owner", ID).expectStatus().isUnauthorized().expectBody().jsonPath("$.code").isEqualTo("UNAUTHORIZED");
        assertTrue(RECEIVED.isEmpty());
    }

    @ParameterizedTest
    @ValueSource(strings = {"http-401", "http-403", "http-404", "http-500", "http-503", "empty-body", "invalid-json",
            "null-row", "multiple", "wrong-id", "missing-version", "zero-version", "null-version", "string-version", "wrong-status"})
    @DisplayName("US-01 (실패·거절) 저장소 장애·잘못된 응답을 정상 조회나 자료 없음으로 숨기지 않는다")
    void upstreamFailureIsInternalError(String scenario) {
        mode = scenario;
        get(OWNER, ID).expectStatus().is5xxServerError().expectBody()
                .jsonPath("$.code").isEqualTo("INTERNAL_ERROR")
                .jsonPath("$.version").doesNotExist()
                .jsonPath("$.message").value(value -> assertFalse(value.toString().contains("private upstream detail")));
    }

    private WebTestClient.ResponseSpec get(String owner, String id) {
        return client.mutateWith(mockJwt().jwt(jwt -> jwt.subject(owner))).get().uri(PATH + id).exchange();
    }

    private record Received(String method, String uri, String authorization) {
    }
}
