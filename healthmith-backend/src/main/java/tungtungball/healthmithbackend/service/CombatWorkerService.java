package tungtungball.healthmithbackend.service;

import jakarta.annotation.PreDestroy;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import reactor.core.Disposable;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.client.CombatWorkerClient;
import tungtungball.healthmithbackend.config.CombatWorkerProperties;

@Service
public class CombatWorkerService {
    private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(CombatWorkerService.class);
    private final CombatWorkerClient client;
    private final CombatWorkerProperties properties;
    private Disposable loop;
    public CombatWorkerService(CombatWorkerClient client,CombatWorkerProperties properties) { this.client=client;this.properties=properties; }
    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        properties.validateEnabled();
        if (properties.enabled()) { loop=Flux.interval(properties.pollInterval()).onBackpressureDrop().concatMap(t -> client.tick().onErrorResume(error -> { log.warn("전투 worker 저장소 요청 실패: {}",error.getClass().getSimpleName());return Mono.empty(); })).subscribe(); }
    }
    @PreDestroy public void stop() { if (loop!=null) { loop.dispose(); } }
}
