package tungtungball.healthmithbackend.repository;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JavaType;
import tungtungball.healthmithbackend.dto.*;
import java.util.UUID;

public interface GenerationStore {
    Mono<ExerciseListResponse> exercises(String token);
    Mono<GenerationRequestResponse> create(UUID submission, UUID key, String token);
    Mono<GenerationRequestResponse> request(UUID id, UUID owner, String token);
    Mono<CurriculumResponse> curriculum(UUID id, UUID owner, String token);
}
