package tungtungball.healthmithbackend.dto;

import tungtungball.healthmithbackend.config.error.ApiErrorResponse;

import java.time.Instant;
import java.util.UUID;

public record GenerationRequestResponse(UUID id, String kind, String status, UUID curriculumId,
                                        ApiErrorResponse error, Instant createdAt, Instant updatedAt) {
}
