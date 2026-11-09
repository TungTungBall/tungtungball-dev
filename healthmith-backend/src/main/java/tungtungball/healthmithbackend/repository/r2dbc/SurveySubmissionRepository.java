package tungtungball.healthmithbackend.repository.r2dbc;

import org.springframework.data.r2dbc.repository.Query;
import org.springframework.data.repository.reactive.ReactiveCrudRepository;
import reactor.core.publisher.Mono;
import java.util.UUID;

public interface SurveySubmissionRepository extends ReactiveCrudRepository<SurveySubmissionEntity, UUID> {
    Mono<SurveySubmissionEntity> findByIdAndUserId(UUID id, UUID userId);

    // DB 기본값과 컬럼별 INSERT 권한을 유지한다. id/created_at은 사용자 입력으로 넣지 않는다.
    @Query("INSERT INTO public.survey_submissions(user_id, answers, generation_request_status) "
            + "VALUES (:owner, CAST(:answers AS jsonb), 'prepared') RETURNING *")
    Mono<SurveySubmissionEntity> insertSubmission(UUID owner, String answers);
}
