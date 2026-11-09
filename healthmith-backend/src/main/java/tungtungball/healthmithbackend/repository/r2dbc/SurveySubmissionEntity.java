package tungtungball.healthmithbackend.repository.r2dbc;

import io.r2dbc.postgresql.codec.Json;
import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Table;
import java.time.Instant;
import java.util.UUID;

@Table("survey_submissions")
public record SurveySubmissionEntity(@Id UUID id, UUID userId, Json answers,
        String generationRequestStatus, Instant createdAt, Long version) {
}
