package tungtungball.healthmithbackend.controller;

import org.junit.jupiter.api.*;
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
import java.util.concurrent.ConcurrentLinkedQueue;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.*;

@SpringBootTest
class JourneyControllerTest {
    private static final String OWNER="20000000-0000-4000-8000-000000000001";
    private static final String ID="40000000-0000-4000-8000-000000000001";
    private static final String KEY="60000000-0000-4000-8000-000000000001";
    private static final JsonMapper RAW=JsonMapper.builder().build();
    private static volatile String outcome="OK";
    private static final ConcurrentLinkedQueue<String> RECEIVED=new ConcurrentLinkedQueue<>();
    private static final String SESSION="""
      {"id":"40000000-0000-4000-8000-000000000001","curriculum_id":"30000000-0000-4000-8000-000000000001","status":"in_progress","current_stage_index":1,"current_repetitions":0,"completed_stage_count":0,"version":1,"stage_results":[],"started_at":"2026-11-04T00:00:00Z","updated_at":"2026-11-04T00:00:00Z","ended_at":null,"feedback_status":"not_submitted"}
      """;
    private static final DisposableServer DATA=HttpServer.create().host("127.0.0.1").port(0).handle((req,res) ->
        req.receive().aggregate().asString().flatMap(body -> {
            RECEIVED.add(body);var node=RAW.readTree(body);String op=node.get("p_operation").asText();
            String data=switch(op) {
                case "start" -> SESSION;
                case "repetition" -> "{\"session\":"+SESSION+",\"event_id\":\""+KEY+"\",\"event_applied\":true}";
                case "feedback" -> req.uri().endsWith("journey_query") ? "{\"feedback\":null}" : "{\"feedback\":{\"id\":\""+KEY+"\",\"session_id\":\""+ID+"\",\"soreness_body_parts\":[\"없음\"],\"difficulty\":3,\"enjoyment\":3,\"created_at\":\"2026-11-04T00:00:00Z\"},\"safety_notice\":null,\"next_generation_request_id\":null,\"tendency_generation_request_id\":null}";
                case "stats" -> "{\"completed_sessions\":0,\"abandoned_sessions\":0,\"current_streak_days\":0,\"streak_timezone\":null,\"body_part_results\":null,\"radar\":null}";
                case "records","gems" -> "{\"items\":[],\"next_cursor\":null,\"has_more\":false}";
                default -> "{}";
            };
            return res.header("Content-Type","application/json").sendString(Mono.just("{\"outcome\":\""+outcome+"\",\"data\":"+(outcome.equals("OK") ? data : "null")+"}")).then();
        })).bindNow();
    @TestBean(methodName="dataClient") private WebClient supabaseWebClient;
    @Autowired private ApplicationContext context;
    private WebTestClient client;
    static WebClient dataClient() { return WebClient.builder().baseUrl("http://127.0.0.1:"+DATA.port()+"/rest/v1").build(); }
    @BeforeEach void setup() { RECEIVED.clear();outcome="OK";client=WebTestClient.bindToApplicationContext(context).apply(springSecurity()).configureClient().build(); }
    @AfterAll static void stop() { DATA.disposeNow(); }
    @Test @DisplayName("US-05 (정상) 확정 버전을 서버 시작 명령으로 변환")
    void start() {
        post("/api/workout-sessions","{\"curriculum_id\":\""+ID+"\",\"expected_curriculum_version\":2}").expectStatus().isCreated();
        var body=RAW.readTree(RECEIVED.element());assertEquals("start",body.get("p_operation").asText());assertEquals(2,body.get("p_payload").get("expected_version").asInt());
        assertFalse(body.get("p_payload").has("curriculum_id"));
    }
    @Test @DisplayName("US-05 (정상) 반복 이벤트는 헤더 대신 event_id 사용")
    void repetition() {
        auth().post().uri("/api/workout-sessions/"+ID+"/repetitions").header("Content-Type","application/json")
            .bodyValue("{\"event_id\":\""+KEY+"\",\"stage_index\":1,\"expected_version\":1}").exchange().expectStatus().isOk().expectBody().jsonPath("$.event_applied").isEqualTo(true);
        assertEquals(KEY,RAW.readTree(RECEIVED.element()).get("p_key").asText());
    }
    @ParameterizedTest @ValueSource(strings={"{\"soreness_body_parts\":[\"없음\",\"허리\"],\"difficulty\":3,\"enjoyment\":3}","{\"soreness_body_parts\":[\"허리\",\"허리\"],\"difficulty\":3,\"enjoyment\":3}","{\"soreness_body_parts\":[\"팔\"],\"difficulty\":3,\"enjoyment\":3}","{\"soreness_body_parts\":[],\"difficulty\":3,\"enjoyment\":3}","{\"soreness_body_parts\":[\"없음\"],\"difficulty\":0,\"enjoyment\":3}","{\"soreness_body_parts\":[\"없음\"],\"difficulty\":3.1,\"enjoyment\":3}","{\"soreness_body_parts\":[\"없음\"],\"difficulty\":\"3\",\"enjoyment\":3}","{\"difficulty\":3,\"enjoyment\":3}","{}"})
    @DisplayName("US-07 (실패·거절) 잘못된 피드백은 INVALID_FEEDBACK과 저장 미호출")
    void invalidFeedback(String body) {
        post("/api/workout-sessions/"+ID+"/feedback",body).expectStatus().isBadRequest().expectBody().jsonPath("$.code").isEqualTo("INVALID_FEEDBACK");assertTrue(RECEIVED.isEmpty());
    }
    @Test @DisplayName("US-07 (정상) 피드백 저장은 생성 미접수와 분리")
    void feedback() {
        post("/api/workout-sessions/"+ID+"/feedback","{\"soreness_body_parts\":[\"없음\"],\"difficulty\":3,\"enjoyment\":3}").expectStatus().isCreated().expectBody().jsonPath("$.next_generation_request_id").isEmpty();
    }
    @ParameterizedTest @ValueSource(strings={"/api/me/workout-records","/api/me/gems","/api/me/workout-stats","/api/workout-sessions/40000000-0000-4000-8000-000000000001/feedback"})
    @DisplayName("US-10 (정상) 빈 목록·통계·미제출 조회")
    void reads(String path) { auth().get().uri(path).exchange().expectStatus().isOk(); }
    @ParameterizedTest @ValueSource(strings={"limit=0","limit=51","limit=1.2","cursor=garbage","cursor=","limit=bad"})
    @DisplayName("US-10 (실패·거절) 잘못된 페이지 입력은 저장소 조회 전 거절")
    void badPages(String query) { auth().get().uri("/api/me/workout-records?"+query).exchange().expectStatus().isBadRequest();assertTrue(RECEIVED.isEmpty()); }
    @ParameterizedTest @CsvSource({"POLICY_NOT_CONFIGURED,503","VERSION_CONFLICT,409","NOT_CURRENT_DRAFT,409","RESOURCE_NOT_FOUND,404","UNAUTHORIZED,401","UNKNOWN,500"})
    @DisplayName("US-03 (실패·권한) 정책 미준비·버전·소유권 오류 구분")
    void failures(String code,int status) { outcome=code;post("/api/curricula/"+ID+"/confirmations","{\"expected_version\":1}").expectStatus().isEqualTo(status); }
    @Test @DisplayName("US-10 (권한) 미인증 목록 접근 차단")
    void anonymous() { client.get().uri("/api/me/gems").exchange().expectStatus().isUnauthorized();assertTrue(RECEIVED.isEmpty()); }
    private WebTestClient auth() { return client.mutateWith(mockJwt().jwt(j -> j.subject(OWNER))); }
    private WebTestClient.ResponseSpec post(String path,String body) { return auth().post().uri(path).header("Content-Type","application/json").header("Idempotency-Key",KEY).bodyValue(body).exchange(); }
}
