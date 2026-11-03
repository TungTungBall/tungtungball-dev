package tungtungball.healthmithbackend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record SurveySubmissionUpdateRequest(
        @NotNull @Valid SurveySubmissionRequest.Answers answers,
        @NotNull @Min(1) Long expectedVersion) {
}
