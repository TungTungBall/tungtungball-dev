package tungtungball.healthmithbackend.repository;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JavaType;
import tungtungball.healthmithbackend.dto.*;
import java.util.UUID;

public interface GenerationWorkflowStore {
    <T> Mono<T> execute(String operation, UUID id, UUID key, Object payload, String token, JavaType type);
}
