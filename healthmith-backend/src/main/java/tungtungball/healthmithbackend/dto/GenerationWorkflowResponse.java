package tungtungball.healthmithbackend.dto;

import java.time.Instant;
import java.util.UUID;
import tungtungball.healthmithbackend.config.error.ApiErrorResponse;

public final class GenerationWorkflowResponse {
    private GenerationWorkflowResponse() { }
    public record Empty() { }
    public record Tendency(String summary, Instant updatedAt, Integer sourceFeedbackCount, String latestGenerationStatus, UUID latestRequestId) { }
    public record Accepted(UUID id,String status,Instant createdAt) { }
    public record Job(UUID id,String status,Integer sourceFeedbackCount,ApiErrorResponse error,Instant createdAt,Instant updatedAt) { }
}
