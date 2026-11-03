package tungtungball.healthmithbackend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record SurveySubmissionRequest(@NotNull @Valid Answers answers) {
    public record Answers(
            @NotNull @Valid PhysicalLimitations physicalLimitations,
            @NotNull @Valid Purpose purpose,
            @NotNull @Min(1) @Max(10) Integer intensity,
            @NotNull List<@NotNull String> priorityBodyParts) {
    }

    public record PhysicalLimitations(
            @NotNull Boolean present,
            @NotNull List<@NotNull String> bodyParts) {
    }

    public record Purpose(@NotBlank String type, String customText) {
    }
}
