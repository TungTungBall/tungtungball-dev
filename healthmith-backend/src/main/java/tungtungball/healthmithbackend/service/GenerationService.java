package tungtungball.healthmithbackend.service;

import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.repository.GenerationStore;
import tungtungball.healthmithbackend.client.GenerationClient;
import tungtungball.healthmithbackend.config.error.ApiErrorResponse;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.dto.CurriculumResponse;
import tungtungball.healthmithbackend.dto.ExerciseListResponse;
import tungtungball.healthmithbackend.dto.GenerationCreateRequest;
import tungtungball.healthmithbackend.dto.GenerationRequestResponse;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class GenerationService {
    private static final Set<String> BODY_PARTS = Set.of("상체", "하체", "허리");
    private static final List<String> STAGE_NAMES = List.of("광석 채굴", "광석 쪼개기", "광석 세척", "광석 가공", "보석 연마");
    private final GenerationStore client;

    public GenerationService(GenerationStore client) {
        this.client = client;
    }

    public Mono<ExerciseListResponse> exercises(Jwt jwt) {
        return Mono.defer(() -> {
            owner(jwt);
            return client.exercises(jwt.getTokenValue()).map(result -> {
                Set<String> ids = new HashSet<>();
                for (var exercise : result.items()) {
                    if (exercise == null || blank(exercise.id()) || !ids.add(exercise.id()) || blank(exercise.name())
                            || blank(exercise.internalFocusInstruction()) || exercise.bodyParts() == null
                            || exercise.bodyParts().isEmpty() || exercise.bodyParts().stream().anyMatch(part -> part == null || !BODY_PARTS.contains(part))
                            || new HashSet<>(exercise.bodyParts()).size() != exercise.bodyParts().size()) {
                        throw GenerationClient.readFailed();
                    }
                }
                return result;
            });
        });
    }

    public Mono<GenerationRequestResponse> create(GenerationCreateRequest request, String key, Jwt jwt) {
        return Mono.defer(() -> {
            owner(jwt);
            return client.create(id(request.surveySubmissionId()), id(key), jwt.getTokenValue())
                    .map(result -> normalizeJob(result, true));
        });
    }

    public Mono<GenerationRequestResponse> request(String value, Jwt jwt) {
        return Mono.defer(() -> {
            UUID owner = owner(jwt);
            UUID id = id(value);
            return client.request(id, owner, jwt.getTokenValue()).map(result -> {
                if (!id.equals(result.id())) {
                    throw GenerationClient.readFailed();
                }
                return normalizeJob(result, false);
            });
        });
    }

    public Mono<CurriculumResponse> curriculum(String value, Jwt jwt) {
        return Mono.defer(() -> {
            UUID owner = owner(jwt);
            UUID id = id(value);
            return client.curriculum(id, owner, jwt.getTokenValue()).map(result -> {
                if (!id.equals(result.id()) || result.surveySubmissionId() == null || result.version() == null || result.version() < 1
                        || result.status() == null || !Set.of("draft", "confirmed", "rejected").contains(result.status())
                        || result.createdAt() == null || result.stages() == null || result.stages().size() != 5
                        || "confirmed".equals(result.status()) != (result.confirmedAt() != null)) {
                    throw GenerationClient.readFailed();
                }
                for (int index = 0; index < 5; index++) {
                    var stage = result.stages().get(index);
                    if (stage == null || stage.stageIndex() == null || stage.stageIndex() != index + 1
                            || !STAGE_NAMES.get(index).equals(stage.stageName()) || blank(stage.exerciseId()) || blank(stage.exerciseName())
                            || stage.targetRepetitions() == null || stage.targetRepetitions() < 1
                            || blank(stage.paceInstruction()) || blank(stage.internalFocusInstruction())) {
                        throw GenerationClient.readFailed();
                    }
                }
                return result;
            });
        });
    }

    private GenerationRequestResponse normalizeJob(GenerationRequestResponse result, boolean initial) {
        boolean valid = result.id() != null && result.kind() != null && result.status() != null
                && Set.of("initial", "regeneration", "next").contains(result.kind())
                && (!initial || "initial".equals(result.kind())) && result.createdAt() != null && result.updatedAt() != null
                && !result.updatedAt().isBefore(result.createdAt());
        ApiErrorResponse error = null;
        if (valid) {
            valid = switch (result.status()) {
                case "queued", "running" -> result.curriculumId() == null && result.error() == null;
                case "succeeded" -> result.curriculumId() != null && result.error() == null;
                case "failed" -> result.curriculumId() == null && result.error() != null;
                default -> false;
            };
        }
        if (valid && result.error() != null) {
            String message = switch (result.error().code() == null ? "" : result.error().code()) {
                case "LLM_UNAVAILABLE" -> "생성 서비스를 이용할 수 없습니다.";
                case "GENERATION_TIMEOUT" -> "생성 처리 시간이 초과되었습니다.";
                case "INVALID_GENERATED_CURRICULUM" -> "생성 결과를 사용할 수 없습니다.";
                case "NO_ELIGIBLE_EXERCISE" -> "구성할 수 있는 지원 운동이 없습니다.";
                default -> null;
            };
            valid = message != null;
            if (valid) {
                error = new ApiErrorResponse(result.error().code(), message, List.of());
            }
        }
        if (!valid) {
            throw initial ? GenerationClient.unavailable() : GenerationClient.readFailed();
        }
        return new GenerationRequestResponse(result.id(), result.kind(), result.status(), result.curriculumId(),
                error, result.createdAt(), result.updatedAt());
    }

    private UUID owner(Jwt jwt) {
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException error) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "인증 상태를 확인해 주세요.", List.of());
        }
    }

    private UUID id(String value) {
        try {
            UUID result = UUID.fromString(value);
            if (!result.toString().equalsIgnoreCase(value)) {
                throw new IllegalArgumentException();
            }
            return result;
        } catch (IllegalArgumentException | NullPointerException error) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "입력 형식을 확인해 주세요.", List.of());
        }
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
