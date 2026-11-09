package tungtungball.healthmithbackend.repository;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JsonNode;
import java.util.UUID;
public interface GenerationWorkerStore {
    Mono<JsonNode> execute(String operation, UUID worker, Object payload);
    default boolean directDatabase() { return false; }
}
