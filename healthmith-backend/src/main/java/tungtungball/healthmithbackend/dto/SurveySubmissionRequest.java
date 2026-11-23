package tungtungball.healthmithbackend.dto;

import jakarta.validation.Valid;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record SurveySubmissionRequest(@NotNull @Valid Answers answers) {
    /** 기존 네 필드는 필수 creator 인자, 통증은 선택 필드로 역직렬화한다. */
    @lombok.EqualsAndHashCode
    @lombok.ToString
    public static final class Answers {
        @NotNull @Valid @JsonProperty("physical_limitations")
        private final PhysicalLimitations physicalLimitations;
        @NotNull @Valid @JsonProperty("purpose")
        private final Purpose purpose;
        @NotNull @Min(1) @Max(10) @JsonProperty("intensity")
        private final Integer intensity;
        @NotNull @JsonProperty("priority_body_parts")
        private final List<@NotNull String> priorityBodyParts;
        @JsonProperty("pain_body_parts") @JsonInclude(JsonInclude.Include.NON_NULL)
        private List<@NotNull String> painBodyParts;

        @JsonCreator
        public Answers(@JsonProperty("physical_limitations") PhysicalLimitations physicalLimitations,
                       @JsonProperty("purpose") Purpose purpose,
                       @JsonProperty("intensity") Integer intensity,
                       @JsonProperty("priority_body_parts") List<String> priorityBodyParts) {
            this.physicalLimitations = physicalLimitations;
            this.purpose = purpose;
            this.intensity = intensity;
            this.priorityBodyParts = priorityBodyParts;
        }

        public PhysicalLimitations physicalLimitations() { return physicalLimitations; }
        public Purpose purpose() { return purpose; }
        public Integer intensity() { return intensity; }
        public List<String> priorityBodyParts() { return priorityBodyParts; }
        public List<String> painBodyParts() { return painBodyParts; }
    }

    public record PhysicalLimitations(
            @NotNull Boolean present,
            @NotNull List<@NotNull String> bodyParts) {
    }

    public record Purpose(@NotBlank String type, String customText) {
    }
}
