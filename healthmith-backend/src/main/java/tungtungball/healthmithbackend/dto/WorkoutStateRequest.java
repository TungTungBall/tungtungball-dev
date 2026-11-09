package tungtungball.healthmithbackend.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record WorkoutStateRequest(@NotNull @Min(1) Long expectedVersion) { }
