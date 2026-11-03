package tungtungball.healthmithbackend.dto;

import java.time.Instant;
import java.util.UUID;

/** 조회 계약 S02. 최초 제출(S01)의 응답에는 version을 추가하지 않는다. */
public record SurveySubmissionDetailResponse(
        UUID id,
        SurveySubmissionRequest.Answers answers,
        String generationRequestStatus,
        Instant createdAt,
        Long version) {
}
