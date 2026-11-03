package tungtungball.healthmithbackend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.DecimalMax;
import java.util.List;
import java.util.UUID;

public final class CombatRequest {
    private CombatRequest() { }
    public record Empty() { }
    public record Match(@NotNull UUID gemId) { }
    public record Pve(@NotNull UUID gemId,@NotBlank String encounterId) { }
    public record Loadout(@NotEmpty List<@NotBlank String> spellIds,@NotNull @Min(1) Long expectedVersion) { }
    public record Cast(@NotNull UUID clientCastId,@NotNull @Min(1) Long clientSequence,@NotBlank String spellId,
                       @NotBlank String runeTemplateVersion,@NotNull @Valid Drawing drawing) { }
    public record Drawing(@NotNull @Min(1) Integer canvasWidth,@NotNull @Min(1) Integer canvasHeight,@NotEmpty List<@NotNull @Valid Stroke> strokes) { }
    public record Stroke(@NotNull @Size(min=2) List<@NotNull @Valid Point> points) { }
    public record Point(@NotNull @DecimalMin("0") @DecimalMax("1") Double x,@NotNull @DecimalMin("0") @DecimalMax("1") Double y,@NotNull @Min(0) Long tMs) { }
    public record CastQuery(UUID castId) { }
    public record EventQuery(String afterEventId) { }
}
