package tungtungball.healthmithbackend.controller;

import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.provider.CsvSource;
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
import java.time.Instant;
import java.util.concurrent.ConcurrentLinkedQueue;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.*;

@SpringBootTest
class CombatControllerTest {
    private static final String OWNER="20000000-0000-4000-8000-000000000001";
    private static final String ID="40000000-0000-4000-8000-000000000001";
    private static final String KEY="60000000-0000-4000-8000-000000000001";
    private static final JsonMapper RAW=JsonMapper.builder().build();
    private static volatile String outcome="OK";
    private static final ConcurrentLinkedQueue<String> REQUESTS=new ConcurrentLinkedQueue<>();
    private static final DisposableServer DATA=HttpServer.create().host("127.0.0.1").port(0).handle((req,res) -> req.receive().aggregate().asString().flatMap(body -> {
        REQUESTS.add(body);String op=RAW.readTree(body).path("p_operation").asText();
        String data=switch(op) {
            case "drawing_limits" -> "{\"max_strokes\":4,\"max_points_per_cast\":100,\"max_duration_ms\":10000,\"max_body_bytes\":1000}";
            case "events" -> "{\"events\":[{\"id\":\"1\",\"event\":\"battle.finished\",\"data\":{\"battle_id\":\""+ID+"\"}}],\"next_event_id\":\"1\",\"terminal\":true,\"poll_interval_ms\":10}";
            case "current_battle" -> "{\"battle\":null}";
            case "current_ticket" -> "{\"ticket\":null}";
            case "records" -> "{\"items\":[],\"next_cursor\":null,\"has_more\":false}";
            case "encounters" -> "{\"items\":[]}";
            default -> "{}";
        };
        String code=op.equals("drawing_limits") ? "OK" : outcome;
        return res.header("Content-Type","application/json").sendString(Mono.just("{\"outcome\":\""+code+"\",\"data\":"+(code.equals("OK") ? data : "null")+"}")).then();
    })).bindNow();
    @TestBean(methodName="dataClient") private WebClient supabaseWebClient;
    @Autowired private ApplicationContext context;
    private WebTestClient client;
    static WebClient dataClient() { return WebClient.builder().baseUrl("http://127.0.0.1:"+DATA.port()+"/rest/v1").build(); }
    @BeforeEach void setup() { REQUESTS.clear();outcome="OK";client=WebTestClient.bindToApplicationContext(context).apply(springSecurity()).configureClient().build(); }
    @AfterAll static void stop() { DATA.disposeNow(); }
    @ParameterizedTest @ValueSource(strings={"/api/pve-encounters","/api/pvp-matchmaking-tickets/current","/api/me/battles/current","/api/me/battle-records"})
    @DisplayName("Combat (정상) 명세 경로의 빈 적·현재 전투·검색·기록 조회")
    void emptyReads(String path) { auth().get().uri(path).exchange().expectStatus().isOk(); }
    @ParameterizedTest @ValueSource(strings={"{}","{\"gem_id\":\"not-uuid\"}","{\"gem_id\":null}","{\"gem_id\":\"40000000-0000-4000-8000-000000000001\",\"user_id\":\"x\"}"})
    @DisplayName("Combat (실패·거절) 검색 입력의 누락·타인 지정·잘못된 UUID 거절")
    void badMatch(String body) { post("/api/pvp-matchmaking-tickets",body).expectStatus().isBadRequest();assertTrue(REQUESTS.isEmpty()); }
    @ParameterizedTest @ValueSource(strings={"{\"spell_ids\":[],\"expected_version\":1}","{\"spell_ids\":[\"A\"],\"expected_version\":0}","{\"spell_ids\":[\"A\"],\"expected_version\":1.1}"})
    @DisplayName("Combat (실패·거절) 덱 필수·버전 입력 거절")
    void badLoadout(String body) {
        auth().put().uri("/api/gems/"+ID+"/spell-loadout").header("Content-Type","application/json").header("Idempotency-Key",KEY).bodyValue(body).exchange().expectStatus().isBadRequest();
        assertTrue(REQUESTS.isEmpty());
    }
    @ParameterizedTest @CsvSource({"GEM_NOT_AVAILABLE,409","BATTLE_NOT_ACTIVE,409","CAST_SEQUENCE_CONFLICT,409","EVENT_CURSOR_EXPIRED,409","INSUFFICIENT_MANA,409","RATE_LIMITED,429","POLICY_NOT_CONFIGURED,503","RESOURCE_NOT_FOUND,404"})
    @DisplayName("Combat (실패·권한) 정책·잠금·순서·요청 제한 HTTP 상태 구분")
    void errors(String code,int status) { outcome=code;post("/api/pve-battles","{\"gem_id\":\""+ID+"\",\"encounter_id\":\"TEST\"}").expectStatus().isEqualTo(status); }
    @Test @DisplayName("Combat (실패·거절) 원시 본문 바이트 한도는 JSON 공백에도 적용")
    void bodyLimit() {
        post("/api/battles/"+ID+"/casts"," ".repeat(1001)+"{}").expectStatus().isBadRequest();
        assertEquals(1,REQUESTS.size());assertEquals("drawing_limits",RAW.readTree(REQUESTS.element()).get("p_operation").asText());
    }
    @Test @DisplayName("Combat (실패·거절) chunked 본문도 원시 바이트 한도 적용")
    void chunkedLimit() {
        auth().post().uri("/api/battles/"+ID+"/casts").header("Content-Type","application/json").header("Idempotency-Key",KEY)
                .body(reactor.core.publisher.Flux.just(" ".repeat(600)," ".repeat(600),"{}"),String.class).exchange().expectStatus().isBadRequest();
        assertTrue(REQUESTS.stream().allMatch(body -> RAW.readTree(body).get("p_operation").asText().equals("drawing_limits")));
    }
    @Test @DisplayName("Combat (실패·거절) 카메라 영상·원시 관절·주장 점수 필드를 받지 않는다")
    void drawingFields() {
        String base="{\"client_cast_id\":\""+KEY+"\",\"client_sequence\":1,\"spell_id\":\"A\",\"rune_template_version\":\"V\",\"drawing\":{\"canvas_width\":100,\"canvas_height\":100,\"strokes\":[{\"points\":[{\"x\":0,\"y\":0,\"t_ms\":0},{\"x\":1,\"y\":1,\"t_ms\":1}]}]}}";
        post("/api/battles/"+ID+"/casts",base.replace("\"t_ms\":0","\"t_ms\":0,\"z\":0")).expectStatus().isBadRequest();
        post("/api/battles/"+ID+"/casts",base.replace("\"client_sequence\":1","\"client_sequence\":1,\"accuracy\":1")).expectStatus().isBadRequest();
        assertTrue(REQUESTS.stream().allMatch(body -> RAW.readTree(body).get("p_operation").asText().equals("drawing_limits")));
    }
    @ParameterizedTest @ValueSource(strings={"", "?after_event_id=-1","?after_event_id=99999999999999999999999999","?after_event_id=x"})
    @DisplayName("Combat (실패·거절) SSE 필수 커서와 범위 검사")
    void badEventCursor(String query) { auth().get().uri("/api/battles/"+ID+"/events"+query).exchange().expectStatus().isBadRequest();assertTrue(REQUESTS.isEmpty()); }
    @Test @DisplayName("Combat (실패·거절) SSE query와 Last-Event-ID 충돌 거절")
    void cursorConflict() { auth().get().uri("/api/battles/"+ID+"/events?after_event_id=0").header("Last-Event-ID","1").exchange().expectStatus().isBadRequest();assertTrue(REQUESTS.isEmpty()); }
    @Test @DisplayName("Combat (정상) SSE 이벤트 ID와 종료 이벤트 전달")
    void events() {
        auth().get().uri("/api/battles/"+ID+"/events?after_event_id=0").exchange().expectStatus().isOk().expectHeader().valueEquals("Content-Type","text/event-stream;charset=UTF-8")
                .expectBody(String.class).value(value -> { assertTrue(value.contains("id:1"));assertTrue(value.contains("event:battle.finished"));assertFalse(value.contains("drawing")); });
    }
    @Test @DisplayName("Combat (정상) PUT·Last-Event-ID CORS preflight 허용")
    void cors() {
        client.options().uri("http://localhost:8080/api/gems/"+ID+"/spell-loadout").header("Origin","http://localhost:3000").header("Access-Control-Request-Method","PUT").header("Access-Control-Request-Headers","Authorization,Idempotency-Key,Last-Event-ID")
                .exchange().expectStatus().isOk().expectHeader().value("Access-Control-Allow-Methods",v -> assertTrue(v.contains("PUT")));
    }
    @Test @DisplayName("Combat (권한) 인증 없는 SSE·시전 거절")
    void anonymous() {
        client.get().uri("/api/battles/"+ID+"/events?after_event_id=0").exchange().expectStatus().isUnauthorized();
        client.post().uri("/api/battles/"+ID+"/casts").exchange().expectStatus().isUnauthorized();assertTrue(REQUESTS.isEmpty());
    }
    private WebTestClient auth() { return client.mutateWith(mockJwt().jwt(jwt -> jwt.subject(OWNER).expiresAt(Instant.now().plusSeconds(60)))); }
    private WebTestClient.ResponseSpec post(String path,String body) { return auth().post().uri(path).header("Content-Type","application/json").header("Idempotency-Key",KEY).bodyValue(body).exchange(); }
}
