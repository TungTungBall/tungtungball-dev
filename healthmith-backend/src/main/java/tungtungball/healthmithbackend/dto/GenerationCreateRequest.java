package tungtungball.healthmithbackend.dto;

import jakarta.validation.constraints.NotBlank;

public record GenerationCreateRequest(@NotBlank String surveySubmissionId) {
}
