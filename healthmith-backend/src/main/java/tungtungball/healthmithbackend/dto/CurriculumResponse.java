package tungtungball.healthmithbackend.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record CurriculumResponse(UUID id, UUID surveySubmissionId, UUID previousCurriculumId,
                                 String status, Long version, List<Stage> stages, Instant createdAt, Instant confirmedAt) {
    public record Stage(Integer stageIndex, String stageName, String exerciseId, String exerciseName,
                        Integer targetRepetitions, String paceInstruction, String internalFocusInstruction) {
    }
}
