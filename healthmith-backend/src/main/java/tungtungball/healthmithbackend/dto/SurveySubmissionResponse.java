package tungtungball.healthmithbackend.dto;

import java.time.Instant;
import java.util.UUID;

public record SurveySubmissionResponse(
        UUID id,
        SurveySubmissionRequest.Answers answers,
        String generationRequestStatus,
        Instant createdAt) {
}
