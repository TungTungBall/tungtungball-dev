package tungtungball.healthmithbackend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.springframework.security.oauth2.jwt.Jwt;
import reactor.core.publisher.Mono;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.client.CombatClient;
import tungtungball.healthmithbackend.client.CombatWorkerClient;
import tungtungball.healthmithbackend.config.CombatWorkerProperties;
import tungtungball.healthmithbackend.dto.CombatResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class CombatServiceTest {
    private final CombatClient client=mock(CombatClient.class);
    private final JsonMapper mapper=JsonMapper.builder().build();
    private final CombatService service=new CombatService(client,mapper);
    private static final String ID="40000000-0000-4000-8000-000000000001";
    private Jwt jwt(Instant expiry) { return Jwt.withTokenValue("synthetic").header("alg","RS256").subject(ID).issuedAt(Instant.now().minusSeconds(10)).expiresAt(expiry).build(); }
    @Test @DisplayName("Combat SSE (권한) 만료 토큰은 재생 저장소 호출 전 거절")
    void expired() { assertThrows(RuntimeException.class,() -> service.events(ID,"0",null,jwt(Instant.now().minusSeconds(1))).block());verifyNoInteractions(client); }
    @Test @DisplayName("Combat SSE (실패·거절) 연결 후 보존 범위 소실은 resync_required 뒤 종료")
    void resync() {
        var first=new CombatResponse.Events(List.of(new CombatResponse.Event("1","actor.updated",mapper.createObjectNode())),"1",false,1L);
        doReturn(Mono.just(first),Mono.error(CombatClient.error("EVENT_CURSOR_EXPIRED"))).when(client).query(eq("events"),any(),any(),anyString(),any());
        var stream=service.events(ID,"0",null,jwt(Instant.now().plusSeconds(5))).block();var events=stream.collectList().block(Duration.ofSeconds(1));
        assertEquals(List.of("actor.updated","resync_required"),events.stream().map(event -> event.event()).toList());
    }
    @Test @DisplayName("Combat SSE (권한) 열린 연결도 토큰 만료 때 종료")
    void expiryClosesStream() {
        var page=new CombatResponse.Events(List.of(),"0",false,10L);
        doReturn(Mono.just(page)).when(client).query(eq("events"),any(),any(),anyString(),any());
        var stream=service.events(ID,"0",null,jwt(Instant.now().plusMillis(150))).block();
        assertFalse(stream.collectList().block(Duration.ofSeconds(2)).isEmpty());
    }
    @Test @DisplayName("Combat worker smoke: 기본 비활성과 비밀 설정 검증")
    void workerDisabled() {
        var database=mock(CombatWorkerClient.class);var properties=new CombatWorkerProperties(false,null,null,null);
        var worker=new CombatWorkerService(database,properties);worker.start();worker.stop();verifyNoInteractions(database);
        var invalid=new CombatWorkerProperties(true,"SECRET",null,null);assertThrows(IllegalStateException.class,invalid::validateEnabled);assertFalse(invalid.toString().contains("SECRET"));
    }
}
