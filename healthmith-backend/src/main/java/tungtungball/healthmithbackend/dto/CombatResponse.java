package tungtungball.healthmithbackend.dto;

import java.util.List;
import java.util.UUID;
import java.time.Instant;
import tools.jackson.databind.JsonNode;

public final class CombatResponse {
    private CombatResponse() { }
    public record DrawingLimits(Integer maxStrokes,Integer maxPointsPerCast,Long maxDurationMs,Integer maxBodyBytes) { }
    public record Spell(String id,String displayName,String category,String target,String runeTemplateVersion,JsonNode guide,Integer baseManaCost,Long cooldownMs,Double recognitionMinScore) { }
    public record Catalog(String rulesetVersion,DrawingLimits drawingLimits,List<Spell> spells) { }
    public record Loadout(UUID gemId,Long version,String rulesetVersion,Integer slotLimit,List<String> spellIds) { }
    public record Encounter(String id,String displayName,String rulesetVersion,Boolean enabled) { }
    public record Encounters(List<Encounter> items) { }
    public record Ticket(UUID id,UUID gemId,Long version,String status,UUID battleId,Instant createdAt,Instant updatedAt) { }
    public record CurrentTicket(Ticket ticket) { }
    public record Actor(String actorId,String kind,UUID gemId,Boolean ready,Integer hp,Integer mana) { }
    public record Battle(UUID id,String mode,String status,String selfActorId,String rulesetVersion,Long version,String lastEventId,Long nextCastSequence,List<Actor> participants,Instant startedAt,Instant endedAt) { }
    public record CurrentBattle(Battle battle) { }
    public record Result(UUID battleId,String mode,String outcome,String reason,UUID gemId,Instant startedAt,Instant endedAt,String finalEventId) { }
    public record Recognition(Boolean recognized,Double accuracy,Double normalizedSize,Double powerMultiplier) { }
    public record Effect(String kind,String targetActorId,Integer amount) { }
    public record Cast(UUID id,UUID battleId,UUID clientCastId,Long clientSequence,String actorId,String spellId,String status,String rejectionCode,Recognition recognition,Integer manaSpent,List<Effect> effects,Long battleVersion,String serverEventId,Instant resolvedAt) { }
    public record Event(String id,String event,JsonNode data) { }
    public record Events(List<Event> events,String nextEventId,Boolean terminal,Long pollIntervalMs) { }
}
