package tungtungball.healthmithbackend.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record WorkoutSessionResponse(UUID id, UUID curriculumId, String status, Integer currentStageIndex,
        Integer currentRepetitions, Integer completedStageCount, Long version, List<StageResult> stageResults,
        Instant startedAt, Instant updatedAt, Instant endedAt, String feedbackStatus) {
    public record StageResult(Integer stageIndex, String exerciseId, Integer targetRepetitions,
                              Integer completedRepetitions, Instant completedAt) { }
}
