package tungtungball.healthmithbackend.repository;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JavaType;
import tungtungball.healthmithbackend.dto.*;
import java.util.UUID;

public interface WorkoutStore {
    Mono<CurrentWorkoutResponse> current(UUID owner, String token);
    Mono<WorkoutSessionResponse> read(UUID id, UUID owner, String token);
    Mono<WorkoutSessionResponse> change(UUID id, long version, String command, String reason, UUID key, String token);
}
