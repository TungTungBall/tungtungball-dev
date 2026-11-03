package tungtungball.healthmithbackend.service;

import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.client.WorkoutClient;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.dto.CurrentWorkoutResponse;
import tungtungball.healthmithbackend.dto.WorkoutSessionResponse;

import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class WorkoutService {
    private final WorkoutClient client;
    public WorkoutService(WorkoutClient client) { this.client = client; }

    public Mono<CurrentWorkoutResponse> current(Jwt jwt) {
        return Mono.defer(() -> client.current(owner(jwt), jwt.getTokenValue()).map(result -> {
            if (result.session() != null) {
                validate(result.session());
                if (!Set.of("in_progress", "paused").contains(result.session().status())) { throw WorkoutClient.failed(); }
            }
            return result;
        }));
    }

    public Mono<WorkoutSessionResponse> read(String value, Jwt jwt) {
        return Mono.defer(() -> {
            UUID owner = owner(jwt); UUID id = id(value);
            return client.read(id, owner, jwt.getTokenValue()).map(result -> {
                validate(result);
                if (!id.equals(result.id())) { throw WorkoutClient.failed(); }
                return result;
            });
        });
    }

    public Mono<WorkoutSessionResponse> change(String value, long version, String command, String reason, String key, Jwt jwt) {
        return Mono.defer(() -> {
            owner(jwt); UUID id = id(value); UUID requestKey = id(key);
            if (version < 1 || version == Long.MAX_VALUE) { throw invalid(); }
            String status = switch (command) { case "pause" -> "paused"; case "resume" -> "in_progress"; case "abandon" -> "abandoned"; default -> throw invalid(); };
            return client.change(id, version, command, reason, requestKey, jwt.getTokenValue()).map(result -> {
                validate(result);
                if (!id.equals(result.id()) || result.version() != version + 1 || !status.equals(result.status())) { throw WorkoutClient.failed(); }
                return result;
            });
        });
    }

    private void validate(WorkoutSessionResponse result) {
        if (result.id() == null || result.curriculumId() == null || result.status() == null
                || !Set.of("in_progress", "paused", "completed", "abandoned").contains(result.status())
                || result.version() == null || result.version() < 1 || result.currentStageIndex() == null
                || result.currentStageIndex() < 1 || result.currentStageIndex() > 5 || result.currentRepetitions() == null
                || result.currentRepetitions() < 0 || result.completedStageCount() == null || result.completedStageCount() < 0
                || result.completedStageCount() > 5 || result.stageResults() == null
                || result.stageResults().size() != result.completedStageCount() || result.startedAt() == null
                || result.updatedAt() == null || result.updatedAt().isBefore(result.startedAt())
                || result.feedbackStatus() == null || !Set.of("not_submitted", "submitted").contains(result.feedbackStatus())) {
            throw WorkoutClient.failed();
        }
        boolean complete = "completed".equals(result.status());
        boolean ended = complete || "abandoned".equals(result.status());
        if (ended != (result.endedAt() != null) || (ended && (result.endedAt().isBefore(result.startedAt())
                || result.endedAt().isAfter(result.updatedAt()))) || (!complete && "submitted".equals(result.feedbackStatus()))
                || (complete ? result.currentStageIndex() != 5 || result.completedStageCount() != 5
                : result.completedStageCount() != result.currentStageIndex() - 1)) { throw WorkoutClient.failed(); }
        for (int i = 0; i < result.stageResults().size(); i++) {
            var stage = result.stageResults().get(i);
            if (stage == null || stage.stageIndex() == null || stage.stageIndex() != i + 1 || stage.exerciseId() == null
                    || stage.exerciseId().isBlank() || stage.targetRepetitions() == null || stage.targetRepetitions() < 1
                    || !stage.targetRepetitions().equals(stage.completedRepetitions()) || stage.completedAt() == null
                    || stage.completedAt().isBefore(i == 0 ? result.startedAt() : result.stageResults().get(i - 1).completedAt())
                    || stage.completedAt().isAfter(result.updatedAt())) { throw WorkoutClient.failed(); }
        }
        if (complete && !result.currentRepetitions().equals(result.stageResults().get(4).targetRepetitions())) { throw WorkoutClient.failed(); }
    }

    private UUID owner(Jwt jwt) {
        try { return UUID.fromString(jwt.getSubject()); }
        catch (IllegalArgumentException | NullPointerException error) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "인증 상태를 확인해 주세요.", List.of());
        }
    }
    private UUID id(String value) {
        try {
            UUID id = UUID.fromString(value);
            if (!id.toString().equalsIgnoreCase(value)) { throw new IllegalArgumentException(); }
            return id;
        } catch (IllegalArgumentException | NullPointerException error) { throw invalid(); }
    }
    private ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "입력 형식을 확인해 주세요.", List.of());
    }
}
