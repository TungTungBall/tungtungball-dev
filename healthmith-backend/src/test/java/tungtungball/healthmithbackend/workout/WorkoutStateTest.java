package tungtungball.healthmithbackend.workout;

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
import org.springframework.test.context.bean.override.convention.TestBean;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.netty.DisposableServer;
import reactor.netty.http.server.HttpServer;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.mockJwt;
import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.springSecurity;

/** W02/W03/W05/W06/W07 계약 검사. 운동 시작·카메라·실제 Supabase 검증이 아니다. */
@SpringBootTest
class WorkoutStateTest {
    private static final String OWNER = "20000000-0000-4000-8000-000000000001";
    private static final String ID = "40000000-0000-4000-8000-000000000001";
    private static final String KEY = "60000000-0000-4000-8000-000000000001";
    private static final String PATH = "/api/workout-sessions/";
    private static volatile String rows;
    private static volatile String outcome;
    private static volatile String changed;
    private static volatile int httpStatus;
    private static final ConcurrentLinkedQueue<Received> RECEIVED = new ConcurrentLinkedQueue<>();
    private static final DisposableServer DATA_API = HttpServer.create().host("127.0.0.1").port(0)
            .handle((request, response) -> request.receive().aggregate().asString().defaultIfEmpty("").flatMap(body -> {
                RECEIVED.add(new Received(request.uri(), request.requestHeaders().get("Authorization"), body));
                String result = request.uri().contains("/rpc/")
                        ? "{\"outcome\":\"" + outcome + "\",\"session\":" + (outcome.equals("UPDATED") ? changed : "null") + "}" : rows;
                return response.status(httpStatus).header("Content-Type", "application/json").sendString(Mono.just(result)).then();
            })).bindNow();
    @TestBean(methodName = "dataApiWebClient") private WebClient supabaseWebClient;
    @Autowired private ApplicationContext context;
    @Autowired private JsonMapper mapper;
    private WebTestClient client;
    static WebClient dataApiWebClient() {
        return WebClient.builder().baseUrl("http://127.0.0.1:" + DATA_API.port() + "/rest/v1")
                .defaultHeader("apikey", "synthetic-publishable-key").build();
    }
    @BeforeEach void setUp() {
        RECEIVED.clear(); rows = "[" + session("in_progress", 1) + "]";
        changed = session("paused", 2); outcome = "UPDATED"; httpStatus = 200;
        client = WebTestClient.bindToApplicationContext(context).apply(springSecurity()).configureClient().build();
    }
    @AfterAll static void stop() { DATA_API.disposeNow(); }

    @Test @DisplayName("US-08 (정상) 현재 세션 조회와 없음은 읽기로만 처리") void currentAndNoSessionAreReadOnly() {
        get("current").expectStatus().isOk().expectBody().jsonPath("$.session.id").isEqualTo(ID);
        var query = new QueryStringDecoder(RECEIVED.element().uri()).parameters();
        assertEquals(List.of("eq." + OWNER), query.get("user_id"));
        assertEquals(List.of("in.(in_progress,paused)"), query.get("status"));
        assertFalse(query.get("select").getFirst().contains("stages"));
        rows = "[]"; get("current").expectStatus().isOk().expectBody().json("{\"session\":null}");
    }
    @Test @DisplayName("US-08 (권한) 소유자·식별자·JWT로 세션 조회 제한") void ownedReadFiltersOwnerIdAndToken() {
        get(ID).expectStatus().isOk().expectBody().jsonPath("$.current_repetitions").isEqualTo(2);
        var request = RECEIVED.element(); var query = new QueryStringDecoder(request.uri()).parameters();
        assertEquals(List.of("eq." + ID), query.get("id"));
        assertEquals(List.of("eq." + OWNER), query.get("user_id"));
        assertEquals("Bearer token", request.authorization());
        rows = "[]"; get(ID).expectStatus().isNotFound().expectBody().jsonPath("$.code").isEqualTo("RESOURCE_NOT_FOUND");
    }
    @ParameterizedTest @CsvSource({"pause,paused", "resume,in_progress", "abandon,abandoned"})
    @DisplayName("US-08 (정상) 중단·재개·포기는 명령 RPC 사용")
    void changesUseAtomicRpc(String command, String status) {
        changed = session(status, 2);
        post(command, body(command), KEY).expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo(status);
        var request = RECEIVED.element(); var data = mapper.readTree(request.body());
        assertEquals("/rest/v1/rpc/change_workout_state", request.uri());
        assertEquals(ID, data.get("p_session_id").asText()); assertEquals(KEY, data.get("p_idempotency_key").asText());
        assertEquals(1, data.get("p_expected_version").asInt()); assertEquals(command, data.get("p_command").asText());
        assertEquals("Bearer token", request.authorization());
        if (command.equals("pause")) { assertEquals("manual", data.get("p_reason").asText()); }
        else { assertTrue(data.get("p_reason").isNull()); }
    }
    @ParameterizedTest @CsvSource({"VERSION_CONFLICT,409", "IDEMPOTENCY_CONFLICT,409", "INVALID_STATE,409",
            "RESOURCE_NOT_FOUND,404", "INVALID_INPUT,400", "UNAUTHORIZED,401", "UNKNOWN,500"})
    @DisplayName("US-08 (실패·권한) RPC 결과의 충돌·없음·오류 매핑")
    void rpcErrors(String result, int status) {
        outcome = result; post("pause", body("pause"), KEY).expectStatus().isEqualTo(status);
    }
    @ParameterizedTest @ValueSource(strings = {"{}", "{\"expected_version\":0}", "{\"expected_version\":1.1}",
            "{\"expected_version\":\"1\"}", "{\"expected_version\":true}", "{\"expected_version\":1,\"user_id\":\"x\"}",
            "{\"expected_version\":null}", "{\"expected_version\":9223372036854775807}"})
    @DisplayName("US-08 (실패) 재개 입력 오류는 저장 전 거절")
    void invalidResumeBodyDoesNotReachStorage(String body) {
        post("resume", body, KEY).expectStatus().isBadRequest(); assertTrue(RECEIVED.isEmpty());
    }
    @ParameterizedTest @ValueSource(strings = {"{\"expected_version\":1}", "{\"expected_version\":1,\"reason\":\"other\"}",
            "{\"expected_version\":1,\"reason\":null}", "{\"expected_version\":1,\"reason\":\"manual\",\"current_repetitions\":3}"})
    @DisplayName("US-08 (실패) 중단 입력 오류는 저장 전 거절")
    void invalidPauseBodyDoesNotReachStorage(String body) {
        post("pause", body, KEY).expectStatus().isBadRequest(); assertTrue(RECEIVED.isEmpty());
    }
    @ParameterizedTest @ValueSource(strings = {"", "not-a-uuid", "1-1-1-1-1"})
    @DisplayName("US-08 (실패) 잘못된 요청 키는 저장 전 거절")
    void invalidKeyDoesNotReachStorage(String key) {
        post("pause", body("pause"), key).expectStatus().isBadRequest(); assertTrue(RECEIVED.isEmpty());
    }
    @Test @DisplayName("US-08 (실패) 누락 키와 잘못된 식별자 거절") void missingKeyAndBadIdRejected() {
        client.mutateWith(mockJwt().jwt(jwt -> jwt.subject(OWNER))).post().uri(PATH + ID + "/resume")
                .header("Content-Type", "application/json").bodyValue(body("resume")).exchange().expectStatus().isBadRequest();
        get("not-a-uuid").expectStatus().isBadRequest(); assertTrue(RECEIVED.isEmpty());
    }
    @Test @DisplayName("US-08 (정상) 미감지 중단 사유 수락") void noMotionAccepted() {
        post("pause", "{\"expected_version\":1,\"reason\":\"no_motion\"}", KEY).expectStatus().isOk();
        assertEquals("no_motion", mapper.readTree(RECEIVED.element().body()).get("p_reason").asText());
    }
    @Test @DisplayName("US-08 (권한) 미인증 조회·변경 거절") void anonymousCannotReadOrWrite() {
        client.get().uri(PATH + "current").exchange().expectStatus().isUnauthorized();
        client.post().uri(PATH + ID + "/pause").header("Content-Type", "application/json")
                .bodyValue(body("pause")).exchange().expectStatus().isUnauthorized(); assertTrue(RECEIVED.isEmpty());
    }
    @ParameterizedTest @ValueSource(strings = {"", "null", "[null]", "{}", "[{},{}]"})
    @DisplayName("US-08 (실패) 잘못된 외부 응답을 현재 세션 없음으로 바꾸지 않음")
    void malformedReadIsNotMissingSession(String value) {
        rows = value; get("current").expectStatus().is5xxServerError(); get(ID).expectStatus().is5xxServerError();
    }
    @Test @DisplayName("US-08 (실패) 중복 활성 세션 응답 거절") void multipleActiveRowsRejected() {
        rows = "[" + session("in_progress",1) + "," + session("paused",1) + "]";
        get("current").expectStatus().is5xxServerError();
    }
    @ParameterizedTest @ValueSource(strings = {"abandoned", "completed"})
    @DisplayName("US-08 (실패) 종료 세션을 현재 활성 세션으로 반환하지 않음")
    void terminalCurrentRejected(String status) {
        rows = "[" + session(status,1) + "]"; get("current").expectStatus().is5xxServerError();
    }
    @Test @DisplayName("US-08 (실패) 잘못된 버전·상태·식별자 응답 거절") void staleOrMismatchedRpcResponseFailsClosed() {
        changed = session("paused",1); post("pause",body("pause"),KEY).expectStatus().is5xxServerError();
        changed = session("in_progress",2); post("pause",body("pause"),KEY).expectStatus().is5xxServerError();
        changed = session("paused",2).replace(ID, KEY); post("pause",body("pause"),KEY).expectStatus().is5xxServerError();
    }
    @Test @DisplayName("US-08 (실패) 잘못된 진행·설문 상태 응답 거절") void invalidProgressFailsClosed() {
        for (String bad : List.of(session("paused",1).replace("\"current_stage_index\":1", "\"current_stage_index\":6"),
                session("paused",1).replace("\"completed_stage_count\":0", "\"completed_stage_count\":1"),
                session("paused",1).replace("not_submitted", "submitted"))) {
            rows = "[" + bad + "]"; get(ID).expectStatus().is5xxServerError();
        }
    }
    @Test @DisplayName("US-08 (실패) 저장 실패에 성공 응답 금지") void storageFailureDoesNotReturnSuccess() {
        httpStatus = 503; get("current").expectStatus().is5xxServerError(); post("pause",body("pause"),KEY).expectStatus().is5xxServerError();
    }
    private WebTestClient.ResponseSpec get(String id) {
        return client.mutateWith(mockJwt().jwt(jwt -> jwt.subject(OWNER))).get().uri(PATH + id).exchange();
    }
    private WebTestClient.ResponseSpec post(String command, String body, String key) {
        return client.mutateWith(mockJwt().jwt(jwt -> jwt.subject(OWNER))).post().uri(PATH + ID + "/" + command)
                .header("Content-Type", "application/json").header("Idempotency-Key",key).bodyValue(body).exchange();
    }
    private String body(String command) {
        return command.equals("pause") ? "{\"expected_version\":1,\"reason\":\"manual\"}" : "{\"expected_version\":1}";
    }
    private String session(String status, long version) {
        String ended = status.equals("abandoned") ? "\"2026-11-03T01:00:00Z\"" : "null";
        return "{\"id\":\"" + ID + "\",\"curriculum_id\":\"30000000-0000-4000-8000-000000000001\",\"status\":\"" + status
                + "\",\"current_stage_index\":1,\"current_repetitions\":2,\"completed_stage_count\":0,\"version\":" + version
                + ",\"stage_results\":[],\"started_at\":\"2026-11-03T00:00:00Z\",\"updated_at\":\"2026-11-03T01:00:00Z\",\"ended_at\":"
                + ended + ",\"feedback_status\":\"not_submitted\"}";
    }
    private record Received(String uri, String authorization, String body) { }
}
