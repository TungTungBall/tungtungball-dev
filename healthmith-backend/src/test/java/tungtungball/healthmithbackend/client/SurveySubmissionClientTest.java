package tungtungball.healthmithbackend.client;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.netty.DisposableServer;
import reactor.netty.http.server.HttpServer;
import reactor.test.StepVerifier;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.dto.SurveySubmissionRequest;
import tungtungball.healthmithbackend.dto.SurveySubmissionResponse;

import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;

import static org.junit.jupiter.api.Assertions.*;

/** 실제 HTTP 대역으로 JSON codec·사용자 토큰·저장 실패 계약을 확인한다. 실제 RLS 검사가 아니다. */
@SpringBootTest
class SurveySubmissionClientTest {
    private static final UUID OWNER = UUID.fromString("20000000-0000-4000-8000-000000000001");
    private static final String SAVED_ID = "10000000-0000-4000-8000-000000000001";
    private static final SurveySubmissionRequest.Answers ANSWERS = new SurveySubmissionRequest.Answers(
            new SurveySubmissionRequest.PhysicalLimitations(false, List.of()),
            new SurveySubmissionRequest.Purpose("자유 입력", "  오래 걷고 싶다  "),
            1, List.of("하체", "상체"));

    @Autowired
    private JsonMapper mapper;

    private DisposableServer server;
    private SurveySubmissionClient client;
    private final ConcurrentLinkedQueue<ReceivedRequest> received = new ConcurrentLinkedQueue<>();
    private String responseBody;
    private int responseStatus;

    @BeforeEach
    void setUp() {
        responseStatus = 201;
        responseBody = "[{\"id\":\"" + SAVED_ID + "\",\"answers\":" + mapper.writeValueAsString(ANSWERS)
                + ",\"generation_request_status\":\"prepared\",\"created_at\":\"2026-11-03T01:00:00Z\"}]";
        server = HttpServer.create().host("127.0.0.1").port(0)
                .handle((request, response) -> request.receive().aggregate().asString().flatMap(body -> {
                    received.add(new ReceivedRequest(request.uri(), request.requestHeaders().get("Authorization"),
                            request.requestHeaders().get("apikey"), request.requestHeaders().get("Prefer"), body));
                    return response.status(responseStatus).header("Content-Type", "application/json")
                            .sendString(Mono.just(responseBody)).then();
                })).bindNow();
        WebClient transport = WebClient.builder().baseUrl("http://127.0.0.1:" + server.port() + "/rest/v1")
                .defaultHeader("apikey", "synthetic-publishable-key").build();
        client = new SurveySubmissionClient(transport, mapper);
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.disposeNow();
        }
    }

    @Test
    @DisplayName("US-01 (정상) snake_case·DB 기본값·요청별 JWT·저장 결과를 보존한다")
    void storesOnlyAllowedColumnsAndReadsDatabaseDefaults() {
        StepVerifier.create(client.insert(OWNER, "synthetic-token-a", ANSWERS))
                .assertNext(row -> {
                    assertEquals(UUID.fromString(SAVED_ID), row.id());
                    assertEquals(ANSWERS, row.answers());
                    assertEquals("prepared", row.generationRequestStatus());
                    assertNotNull(row.createdAt());
                }).verifyComplete();

        assertEquals(1, received.size());
        ReceivedRequest request = received.element();
        assertEquals("/rest/v1/survey_submissions?select=id,answers,generation_request_status,created_at", request.uri());
        assertEquals("Bearer synthetic-token-a", request.authorization());
        assertEquals("synthetic-publishable-key", request.apiKey());
        assertEquals("return=representation", request.prefer());
        var body = mapper.readTree(request.body());
        assertEquals(3, body.size());
        assertEquals(OWNER.toString(), body.get("user_id").asString());
        assertEquals("prepared", body.get("generation_request_status").asString());
        assertFalse(body.has("id"));
        assertFalse(body.has("created_at"));
        assertEquals(mapper.readTree(mapper.writeValueAsString(ANSWERS)), body.get("answers"));
        assertTrue(body.get("answers").has("physical_limitations"));
        assertEquals("  오래 걷고 싶다  ", body.get("answers").get("purpose").get("custom_text").asString());
    }

    @Test
    @DisplayName("US-01 (권한) 동시 저장의 사용자 소유자와 JWT가 섞이지 않는다")
    void concurrentUsersKeepTheirOwnTokens() {
        UUID otherOwner = UUID.fromString("20000000-0000-4000-8000-000000000002");
        StepVerifier.create(Mono.zip(client.insert(OWNER, "synthetic-token-a", ANSWERS),
                        client.insert(otherOwner, "synthetic-token-b", ANSWERS)))
                .expectNextCount(1).verifyComplete();
        assertEquals(2, received.size());
        for (ReceivedRequest request : received) {
            String owner = mapper.readTree(request.body()).get("user_id").asString();
            assertEquals(owner.equals(OWNER.toString()) ? "Bearer synthetic-token-a" : "Bearer synthetic-token-b",
                    request.authorization());
        }
    }

    @ParameterizedTest
    @ValueSource(ints = {400, 401, 403, 500, 503})
    @DisplayName("US-01 (실패·거절) Data API 오류를 저장 성공으로 응답하지 않는다")
    void upstreamHttpFailureIsSaveFailed(int status) {
        responseStatus = status;
        responseBody = "{\"message\":\"synthetic private database detail\"}";
        assertSaveFailed(client.insert(OWNER, "synthetic-token-a", ANSWERS));
        assertEquals(1, received.size());
    }

    @ParameterizedTest
    @ValueSource(strings = {"[]", "", "{}", "not-json", "[null]"})
    @DisplayName("US-01 (실패·거절) 빈 응답이나 잘못된 저장 응답을 prepared로 인정하지 않는다")
    void malformedOrEmptyRepresentationIsSaveFailed(String body) {
        responseBody = body;
        assertSaveFailed(client.insert(OWNER, "synthetic-token-a", ANSWERS));
    }

    @Test
    @DisplayName("US-01 (실패·거절) 입력과 다른 answers를 반환하면 저장 성공으로 인정하지 않는다")
    void mismatchedAnswersAreSaveFailed() {
        responseBody = responseBody.replace("\"intensity\":1", "\"intensity\":10");
        assertSaveFailed(client.insert(OWNER, "synthetic-token-a", ANSWERS));
    }

    @Test
    @DisplayName("US-01 (실패·거절) 저장 상태가 prepared가 아니면 성공으로 인정하지 않는다")
    void mismatchedStatusIsSaveFailed() {
        responseBody = responseBody.replace("prepared", "queued");
        assertSaveFailed(client.insert(OWNER, "synthetic-token-a", ANSWERS));
    }

    @Test
    @DisplayName("US-01 (실패·거절) 여러 행을 반환하면 한 행 저장 성공으로 인정하지 않는다")
    void multipleRowsAreSaveFailed() {
        String row = responseBody.substring(1, responseBody.length() - 1);
        responseBody = "[" + row + "," + row + "]";
        assertSaveFailed(client.insert(OWNER, "synthetic-token-a", ANSWERS));
    }

    private void assertSaveFailed(Mono<SurveySubmissionResponse> result) {
        StepVerifier.create(result).expectErrorSatisfies(error -> {
            ApiException failure = assertInstanceOf(ApiException.class, error);
            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, failure.getStatus());
            assertEquals("SAVE_FAILED", failure.getCode());
            assertEquals(List.of(), failure.getFieldErrors());
            assertFalse(failure.getMessage().contains("synthetic private database detail"));
        }).verify(Duration.ofSeconds(10));
    }

    private record ReceivedRequest(String uri, String authorization, String apiKey, String prefer, String body) {
    }
}
