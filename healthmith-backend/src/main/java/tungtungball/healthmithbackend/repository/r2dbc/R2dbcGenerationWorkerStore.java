package tungtungball.healthmithbackend.repository.r2dbc;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JsonNode;
import tungtungball.healthmithbackend.config.GenerationWorkerProperties;
import tungtungball.healthmithbackend.repository.GenerationWorkerStore;
import java.util.UUID;

@Repository
@ConditionalOnProperty(name="app.persistence.mode", havingValue="r2dbc", matchIfMissing=true)
public class R2dbcGenerationWorkerStore implements GenerationWorkerStore {
    private final WorkerDatabase database;
    private final GenerationWorkerProperties properties;
    public R2dbcGenerationWorkerStore(WorkerDatabase database, GenerationWorkerProperties properties) {
        this.database = database; this.properties = properties;
        if (properties.enabled() && !database.configured()) { throw new IllegalStateException("생성 worker DB 설정이 필요합니다."); }
    }
    public boolean directDatabase() { return true; }
    public Mono<JsonNode> execute(String operation, UUID worker, Object payload) {
        return database.generation(operation, worker, properties.leaseSeconds(), payload).timeout(properties.requestTimeout());
    }
}
