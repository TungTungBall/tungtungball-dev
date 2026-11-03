package tungtungball.healthmithbackend;

import io.netty.handler.codec.http.QueryStringDecoder;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
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

import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.mockJwt;
import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.springSecurity;

/** 네 API의 계약/대역 검사. 실제 운동·Gemini·Supabase 성공으로 기록하지 않는다. */
@SpringBootTest
class GenerationFoundationTest {
    private static final String OWNER = "20000000-0000-4000-8000-000000000001";
    private static final String SOURCE = "10000000-0000-4000-8000-000000000001";
    private static final String JOB = "50000000-0000-4000-8000-000000000001";
    private static final String CURRICULUM = "30000000-0000-4000-8000-000000000001";
    private static final String KEY = "40000000-0000-4000-8000-000000000001";
    private static final String REQUEST_PATH = "/api/curriculum-generation-requests";
    private static final String CURRICULUM_PATH = "/api/curricula/";
    private static final String EXERCISE = """
            {"id":"EXAMPLE_A","name":"테스트 운동 A","body_parts":["상체"],"internal_focus_instruction":"테스트 안내"}
            """;
    private static final ConcurrentLinkedQueue<Received> RECEIVED = new ConcurrentLinkedQueue<>();
    private static volatile String exercises;
    private static volatile String job;
    private static volatile String curriculum;
    private static volatile String outcome;
    private static volatile int httpStatus;
    private static final DisposableServer DATA_API = HttpServer.create().host("127.0.0.1").port(0)
            .handle((request, response) -> request.receive().aggregate().asString().defaultIfEmpty("").flatMap(body -> {
                RECEIVED.add(new Received(request.method().name(), request.uri(), request.requestHeaders().get("Authorization"), body));
                var query = new QueryStringDecoder(request.uri()).parameters();
                String result;
                if (request.uri().startsWith("/rest/v1/rpc/")) {
                    result = "{\"outcome\":\"" + outcome + "\",\"request\":" + (outcome.equals("ACCEPTED") ? job : "null") + "}";
                } else if (request.uri().startsWith("/rest/v1/exercise_catalog")) {
                    result = exercises;
                } else if (!List.of("eq." + OWNER).equals(query.get("user_id"))) {
                    result = "[]";
                } else if (request.uri().startsWith("/rest/v1/curriculum_generation_requests")) {
                    result = job == null ? "[]" : "[" + job + "]";
                } else {
                    result = curriculum == null ? "[]" : "[" + curriculum + "]";
                }
                return response.status(httpStatus).header("Content-Type", "application/json").sendString(Mono.just(result)).then();
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
        RECEIVED.clear();
        exercises = "[" + EXERCISE + "]";
        job = job("queued");
        curriculum = curriculum();
        outcome = "ACCEPTED";
        httpStatus = 200;
        client = WebTestClient.bindToApplicationContext(context).apply(springSecurity()).configureClient().build();
    }

    @AfterAll
    static void stopDataApi() {
        DATA_API.disposeNow();
    }

    @Test
    @DisplayName("US-02 (정상) 지원 운동 조회는 등록된 값만 반환하며 빈 목록도 보존한다")
    void registeredExercisesAndEmptyList() {
        get("/api/exercises").expectStatus().isOk().expectBody().jsonPath("$.items[0].id").isEqualTo("EXAMPLE_A");
        var query = new QueryStringDecoder(RECEIVED.element().uri()).parameters();
        assertEquals(List.of("eq.true"), query.get("enabled"));
        exercises = "[]";
        get("/api/exercises").expectStatus().isOk().expectBody().jsonPath("$.items").isEmpty();
        assertTrue(RECEIVED.stream().allMatch(request -> request.method().equals("GET")));
    }

    @Test
    @DisplayName("US-02 (정상) 생성 접수는 202·Location·queued이며 소유자를 본문에 보내지 않는다")
    void acceptedGenerationContract() {
        post("{\"survey_submission_id\":\"" + SOURCE + "\"}", KEY).expectStatus().isAccepted()
                .expectHeader().valueEquals("Location", REQUEST_PATH + "/" + JOB)
                .expectBody().jsonPath("$.status").isEqualTo("queued").jsonPath("$.curriculum_id").isEmpty()
                .jsonPath("$.user_id").doesNotExist();
        Received rpc = RECEIVED.element();
        assertEquals("POST", rpc.method());
        assertEquals("/rest/v1/rpc/create_initial_generation", rpc.uri());
        assertEquals("Bearer token", rpc.authorization());
        var input = mapper.readTree(rpc.body());
        assertEquals(2, input.size());
        assertEquals(SOURCE, input.get("p_submission_id").asString());
        assertEquals(KEY, input.get("p_idempotency_key").asString());
    }

    @ParameterizedTest
    @CsvSource({"NO_ELIGIBLE_EXERCISE,409", "INVALID_STATE,409", "IDEMPOTENCY_CONFLICT,409",
            "GENERATION_UNAVAILABLE,503", "RESOURCE_NOT_FOUND,404", "UNAUTHORIZED,401", "INVALID_INPUT,400"})
    @DisplayName("US-02 (실패·거절) 접수 실패를 202나 생성 완료로 응답하지 않는다")
    void failedAcceptanceIsNotQueued(String code, int status) {
        outcome = code;
        post("{\"survey_submission_id\":\"" + SOURCE + "\"}", KEY).expectStatus().isEqualTo(status)
                .expectBody().jsonPath("$.status").doesNotExist();
    }

    @ParameterizedTest
    @ValueSource(strings = {"queued", "running", "succeeded", "failed"})
    @DisplayName("US-02 (정상) 생성 작업 상태와 HTTP 조회 성공을 구분하고 내부 정보를 숨긴다")
    void jobStatusContract(String status) {
        job = job(status);
        var response = get(REQUEST_PATH + "/" + JOB).expectStatus().isOk().expectBody()
                .jsonPath("$.status").isEqualTo(status).jsonPath("$.input_snapshot").doesNotExist();
        if (status.equals("failed")) {
            response.jsonPath("$.error.code").isEqualTo("GENERATION_TIMEOUT")
                    .jsonPath("$.error.message").value(value -> assertFalse(value.toString().contains("private raw")))
                    .jsonPath("$.error.field_errors").isEmpty();
        }
        assertEquals(List.of("eq." + OWNER), new QueryStringDecoder(RECEIVED.element().uri()).parameters().get("user_id"));
    }

    @Test
    @DisplayName("US-02 (정상) 검증된 5단계 초안만 조회하고 확정·게임 시작을 실행하지 않는다")
    void readValidatedCurriculum() {
        get(CURRICULUM_PATH + CURRICULUM).expectStatus().isOk().expectBody()
                .jsonPath("$.status").isEqualTo("draft").jsonPath("$.stages.length()").isEqualTo(5)
                .jsonPath("$.stages[4].stage_name").isEqualTo("보석 연마");
        Received request = RECEIVED.element();
        assertEquals("GET", request.method());
        assertEquals(List.of("eq.true"), new QueryStringDecoder(request.uri()).parameters().get("validated"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/exercises", "/api/curriculum-generation-requests/50000000-0000-4000-8000-000000000001",
            "/api/curricula/30000000-0000-4000-8000-000000000001"})
    @DisplayName("US-02 (권한) 인증 없는 조회는 Data API를 호출하지 않는다")
    void missingAuthentication(String path) {
        client.get().uri(path).exchange().expectStatus().isUnauthorized();
        assertTrue(RECEIVED.isEmpty());
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/curriculum-generation-requests/invalid", "/api/curricula/1-1-1-1-1"})
    @DisplayName("US-02 (실패·거절) 잘못된 경로 ID는 저장소 호출 없이 거절한다")
    void invalidPath(String path) {
        get(path).expectStatus().isBadRequest().expectBody().jsonPath("$.code").isEqualTo("INVALID_REQUEST");
        assertTrue(RECEIVED.isEmpty());
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"survey_submission_id\":null}", "{\"survey_submission_id\":\"invalid\"}",
            "{\"survey_submission_id\":\"10000000-0000-4000-8000-000000000001\",\"user_id\":\"injected\"}"})
    @DisplayName("US-02 (실패·거절) 생성 요청 입력을 기본값으로 채우거나 소유자를 주입하지 않는다")
    void invalidCreateBody(String body) {
        post(body, KEY).expectStatus().isBadRequest();
        assertTrue(RECEIVED.isEmpty());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "invalid", "1-1-1-1-1"})
    @DisplayName("US-02 (실패·거절) 생성 키 누락·형식 오류는 RPC를 호출하지 않는다")
    void invalidCreateKey(String key) {
        post("{\"survey_submission_id\":\"" + SOURCE + "\"}", key).expectStatus().isBadRequest();
        assertTrue(RECEIVED.isEmpty());
    }

    @Test
    @DisplayName("US-02 (권한) 타인과 없는 작업·초안은 같은 404다")
    void ownedReadNotFound() {
        client.mutateWith(mockJwt().jwt(jwt -> jwt.subject("20000000-0000-4000-8000-000000000002")))
                .get().uri(REQUEST_PATH + "/" + JOB).exchange().expectStatus().isNotFound();
        job = null;
        get(REQUEST_PATH + "/" + JOB).expectStatus().isNotFound();
        curriculum = null;
        get(CURRICULUM_PATH + CURRICULUM).expectStatus().isNotFound();
        assertTrue(RECEIVED.stream().allMatch(request -> request.method().equals("GET")));
    }

    @ParameterizedTest
    @ValueSource(strings = {"unknown-status", "pending-result", "failed-with-result", "succeeded-without-result", "wrong-id", "bad-time"})
    @DisplayName("US-02 (실패·거절) 모순되거나 잘못된 작업 결과는 조회 성공으로 내보내지 않는다")
    void invalidJobState(String scenario) {
        job = switch (scenario) {
            case "unknown-status" -> job.replace("queued", "unknown");
            case "pending-result" -> job.replace("\"curriculum_id\":null", "\"curriculum_id\":\"" + CURRICULUM + "\"");
            case "failed-with-result" -> job("failed").replace("\"curriculum_id\":null", "\"curriculum_id\":\"" + CURRICULUM + "\"");
            case "succeeded-without-result" -> job("succeeded").replace("\"" + CURRICULUM + "\"", "null");
            case "wrong-id" -> job.replace(JOB, SOURCE);
            default -> job.replace("\"updated_at\":\"2026-11-03", "\"updated_at\":\"2026-11-02");
        };
        get(REQUEST_PATH + "/" + JOB).expectStatus().is5xxServerError();
    }

    @ParameterizedTest
    @ValueSource(strings = {"count", "name", "repetitions", "index", "version", "confirmed", "id"})
    @DisplayName("US-02 (실패·거절) 잘못된 5단계·버전·확정 상태를 정상 초안으로 내보내지 않는다")
    void invalidCurriculum(String field) {
        curriculum = switch (field) {
            case "count" -> curriculum.replace("\"stages\":[", "\"stages\":[null,");
            case "name" -> curriculum.replace("광석 채굴", "임의 단계");
            case "repetitions" -> curriculum.replace("\"target_repetitions\":3", "\"target_repetitions\":0");
            case "index" -> curriculum.replace("\"stage_index\":1", "\"stage_index\":2");
            case "version" -> curriculum.replace("\"version\":1", "\"version\":0");
            case "confirmed" -> curriculum.replace("draft", "confirmed");
            default -> curriculum.replace(CURRICULUM, SOURCE);
        };
        get(CURRICULUM_PATH + CURRICULUM).expectStatus().is5xxServerError();
    }

    @ParameterizedTest
    @ValueSource(strings = {"null", "{}", "[null]", "[{\"id\":\"unknown\"}]"})
    @DisplayName("US-02 (실패·거절) 손상된 카탈로그를 가짜 지원 운동으로 대체하지 않는다")
    void invalidCatalog(String body) {
        exercises = body;
        get("/api/exercises").expectStatus().is5xxServerError();
    }

    @Test
    @DisplayName("US-02 (실패·거절) 저장소 HTTP 실패는 접수와 읽기의 오류를 구분한다")
    void upstreamFailure() {
        httpStatus = 500;
        post("{\"survey_submission_id\":\"" + SOURCE + "\"}", KEY).expectStatus().isEqualTo(503)
                .expectBody().jsonPath("$.code").isEqualTo("GENERATION_UNAVAILABLE");
        get(REQUEST_PATH + "/" + JOB).expectStatus().is5xxServerError()
                .expectBody().jsonPath("$.code").isEqualTo("INTERNAL_ERROR");
    }

    @Test
    @DisplayName("US-02 (정상) 브라우저가 접수 Location 헤더를 읽을 수 있다")
    void locationCorsExposure() {
        client.mutateWith(mockJwt().jwt(jwt -> jwt.subject(OWNER))).post()
                .uri("http://localhost:8080" + REQUEST_PATH).header("Origin", "http://localhost:3000")
                .header("Idempotency-Key", KEY).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"survey_submission_id\":\"" + SOURCE + "\"}").exchange().expectStatus().isAccepted()
                .expectHeader().value("Access-Control-Expose-Headers", value -> assertTrue(value.contains("Location")));
    }

    private WebTestClient.ResponseSpec get(String path) {
        return client.mutateWith(mockJwt().jwt(jwt -> jwt.subject(OWNER))).get().uri(path).exchange();
    }

    private WebTestClient.ResponseSpec post(String body, String key) {
        var request = client.mutateWith(mockJwt().jwt(jwt -> jwt.subject(OWNER))).post().uri(REQUEST_PATH);
        if (!key.isEmpty()) {
            request.header("Idempotency-Key", key);
        }
        return request.contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange();
    }

    private static String job(String status) {
        String result = status.equals("succeeded") ? "\"" + CURRICULUM + "\"" : "null";
        String error = status.equals("failed") ? "{\"code\":\"GENERATION_TIMEOUT\",\"message\":\"private raw LLM text\",\"field_errors\":[]}" : "null";
        return "{\"id\":\"" + JOB + "\",\"kind\":\"initial\",\"status\":\"" + status + "\",\"curriculum_id\":" + result
                + ",\"error\":" + error + ",\"created_at\":\"2026-11-03T01:00:00Z\",\"updated_at\":\"2026-11-03T01:00:00Z\"}";
    }

    private static String curriculum() {
        List<String> names = List.of("광석 채굴", "광석 쪼개기", "광석 세척", "광석 가공", "보석 연마");
        String stages = IntStream.range(0, 5).mapToObj(index -> "{\"stage_index\":" + (index + 1) + ",\"stage_name\":\"" + names.get(index)
                + "\",\"exercise_id\":\"EXAMPLE_A\",\"exercise_name\":\"테스트 운동 A\",\"target_repetitions\":3,\"pace_instruction\":\"테스트 속도\",\"internal_focus_instruction\":\"테스트 안내\"}")
                .collect(Collectors.joining(","));
        return "{\"id\":\"" + CURRICULUM + "\",\"survey_submission_id\":\"" + SOURCE + "\",\"previous_curriculum_id\":null,\"status\":\"draft\",\"version\":1,\"stages\":["
                + stages + "],\"created_at\":\"2026-11-03T01:00:00Z\",\"confirmed_at\":null}";
    }

    private record Received(String method, String uri, String authorization, String body) {
    }
}
