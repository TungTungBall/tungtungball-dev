package tungtungball.healthmithbackend.repository;

import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.dto.*;
import java.util.UUID;

/** API 계약과 저장 전송 수단을 분리한다. */
public interface SurveySubmissionStore {
    Mono<SurveySubmissionResponse> insert(UUID owner, String token, SurveySubmissionRequest.Answers answers);
    Mono<SurveySubmissionDetailResponse> find(UUID id, UUID owner, String token);
    Mono<SurveySubmissionDetailResponse> update(UUID id, UUID key, SurveySubmissionUpdateRequest request, String token);
}
