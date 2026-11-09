package tungtungball.healthmithbackend.service;

import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.repository.SurveySubmissionStore;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.dto.SurveySubmissionDetailResponse;

import java.util.List;
import java.util.UUID;

@Service
public class SurveySubmissionQueryService {
    private final SurveySubmissionStore client;

    public SurveySubmissionQueryService(SurveySubmissionStore client) {
        this.client = client;
    }

    public Mono<SurveySubmissionDetailResponse> find(String submissionId, Jwt jwt) {
        return Mono.defer(() -> {
            UUID owner;
            try {
                owner = UUID.fromString(jwt.getSubject());
            } catch (IllegalArgumentException | NullPointerException error) {
                return Mono.error(new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED",
                        "인증 상태를 확인해 주세요.", List.of()));
            }
            UUID id;
            try {
                id = UUID.fromString(submissionId);
                if (!id.toString().equalsIgnoreCase(submissionId)) {
                    throw new IllegalArgumentException();
                }
            } catch (IllegalArgumentException error) {
                return Mono.error(new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST",
                        "입력 형식을 확인해 주세요.", List.of()));
            }
            return client.find(id, owner, jwt.getTokenValue());
        });
    }
}
