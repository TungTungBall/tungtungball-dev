package tungtungball.healthmithbackend.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record WorkoutPauseRequest(@NotNull @Min(1) Long expectedVersion,
                                  @NotNull @Pattern(regexp = "manual|no_motion") String reason) { }
