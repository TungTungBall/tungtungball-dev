package tungtungball.healthmithbackend.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import tools.jackson.databind.JsonNode;

public final class JourneyResponse {
    private JourneyResponse() { }
    public record Repetition(WorkoutSessionResponse session, UUID eventId, Boolean eventApplied) { }
    public record Feedback(UUID id, UUID sessionId, List<String> sorenessBodyParts, Integer difficulty, Integer enjoyment, Instant createdAt) { }
    public record FeedbackRead(Feedback feedback) { }
    public record FeedbackSaved(Feedback feedback, String safetyNotice, UUID nextGenerationRequestId, UUID tendencyGenerationRequestId) { }
    public record ResultGem(UUID id, UUID sourceWorkoutSessionId, String state, String displayName) { }
    public record Result(WorkoutSessionResponse session, ResultGem gem) { }
    public record Gem(UUID id, UUID sourceWorkoutSessionId, String state, String displayName, String availability, Instant createdAt) { }
    public record Record(UUID sessionId, String result, Instant endedAt, Integer completedStageCount, String feedbackStatus) { }
    public record Stats(Long completedSessions, Long abandonedSessions, Integer currentStreakDays, String streakTimezone, JsonNode bodyPartResults, JsonNode radar) { }
    public record Page<T>(List<T> items, String nextCursor, Boolean hasMore) { }
    public record Cursor(UUID owner, String operation, Instant time, UUID id) { }
}
