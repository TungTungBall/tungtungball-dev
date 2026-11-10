package tungtungball.healthmithbackend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import java.time.Duration;

@ConfigurationProperties("generation.worker")
public record GenerationWorkerProperties(@DefaultValue("false") boolean enabled,String serviceKey,String geminiKey,String model,
        Duration pollInterval,Duration requestTimeout,Duration queuedTimeout,Integer leaseSeconds,Integer maxOutputTokens) {
    public void validateEnabled() { validateEnabled(false); }
    public void validateEnabled(boolean directDatabase) {
        if (!enabled) { return; }
        if ((!directDatabase && (serviceKey==null || serviceKey.isBlank())) || geminiKey==null || geminiKey.isBlank() || model==null || !model.matches("[a-zA-Z0-9._-]+")
                || pollInterval==null || pollInterval.isNegative() || pollInterval.isZero() || requestTimeout==null || requestTimeout.isNegative() || requestTimeout.isZero()
                || queuedTimeout==null || queuedTimeout.isNegative() || queuedTimeout.isZero() || leaseSeconds==null || leaseSeconds<=0
                || requestTimeout.compareTo(Duration.ofSeconds(leaseSeconds))>=0 || pollInterval.compareTo(Duration.ofSeconds(leaseSeconds))>=0
                || maxOutputTokens==null || maxOutputTokens<=0) {
            throw new IllegalStateException("생성 worker 설정을 확인하세요: GENERATION_WORKER_GEMINI_KEY, MODEL, POLL_INTERVAL, REQUEST_TIMEOUT, QUEUED_TIMEOUT, LEASE_SECONDS, MAX_OUTPUT_TOKENS가 필요하고 poll/request 시간은 lease보다 짧아야 합니다. PostgREST 모드에는 GENERATION_WORKER_SERVICE_KEY도 필요합니다.");
        }
    }
    @Override public String toString() { return "GenerationWorkerProperties[enabled="+enabled+", credentials=redacted]"; }
}
