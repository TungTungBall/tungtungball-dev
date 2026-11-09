package tungtungball.healthmithbackend.repository;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JavaType;
import tungtungball.healthmithbackend.dto.*;
import java.util.UUID;

public interface JourneyStore {
    <T> Mono<T> command(String operation, UUID id, UUID key, Object payload, String token, JavaType type);
    <T> Mono<T> query(String operation, UUID id, Object payload, String token, JavaType type);
}
