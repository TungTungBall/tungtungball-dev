package tungtungball.healthmithbackend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** v1과 변환하지 않는 상세 사전조사 계약. 선택 강도는 명시적인 null을 허용한다. */
public final class SurveyV2 {
    private SurveyV2() { }
    public record Answers(
            @NotNull String goal, @NotNull String experience,
            @NotNull Integer availableMinutes, @NotNull @Min(1) @Max(7) Integer daysPerWeek,
            @NotNull Boolean limitationsPresent, @NotNull List<@NotNull @Valid Limitation> limitations,
            @NotNull List<@NotNull String> priorityBodyParts) { }
    public record Limitation(@NotNull String part, @NotNull String side, @NotNull String severity) { }
    public record Create(@NotNull @Valid Answers answers) { }
    public record Update(@NotNull @Valid Answers answers, @NotNull @Min(1) Long expectedVersion) { }
    public record Detail(UUID id, Integer schemaVersion, Answers answers, Long version, Instant createdAt) { }
}
