package tungtungball.healthmithbackend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import java.time.Duration;

@ConfigurationProperties("combat.worker")
public record CombatWorkerProperties(@DefaultValue("false") boolean enabled,String serviceKey,Duration pollInterval,Duration requestTimeout) {
    public void validateEnabled() {
        if (enabled && (serviceKey==null || serviceKey.isBlank() || pollInterval==null || pollInterval.isNegative() || pollInterval.isZero() || requestTimeout==null || requestTimeout.isNegative() || requestTimeout.isZero())) {
            throw new IllegalStateException("전투 worker 운영 설정이 필요합니다.");
        }
    }
    @Override public String toString() { return "CombatWorkerProperties[enabled="+enabled+", credentials=redacted]"; }
}
