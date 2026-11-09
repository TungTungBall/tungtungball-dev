package tungtungball.healthmithbackend.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public final class JourneyRequest {
    private JourneyRequest() { }
    public record Version(@NotNull @Min(1) Long expectedVersion) { }
    public record Start(@NotBlank String curriculumId, @NotNull @Min(1) Long expectedCurriculumVersion) { }
    public record Repetition(@NotBlank String eventId, @NotNull @Min(1) @Max(5) Integer stageIndex,
                             @NotNull @Min(1) Long expectedVersion) { }
    public record Feedback(@NotNull @Size(min=1,max=4) List<@NotNull String> sorenessBodyParts,
                           @NotNull @Min(1) @Max(5) Integer difficulty, @NotNull @Min(1) @Max(5) Integer enjoyment) { }
}
