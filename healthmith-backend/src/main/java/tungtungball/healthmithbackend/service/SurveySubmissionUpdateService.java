package tungtungball.healthmithbackend.service;

import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.repository.SurveySubmissionStore;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.dto.SurveySubmissionDetailResponse;
import tungtungball.healthmithbackend.dto.SurveySubmissionUpdateRequest;

import java.util.List;
import java.util.UUID;

@Service
public class SurveySubmissionUpdateService {
    private final SurveySubmissionStore client;
    private final SurveyValidationService validation;

    public SurveySubmissionUpdateService(SurveySubmissionStore client, SurveyValidationService validation) {
        this.client = client;
        this.validation = validation;
    }

    public Mono<SurveySubmissionDetailResponse> update(
            String submissionId, String requestKey, SurveySubmissionUpdateRequest request, Jwt jwt) {
        return Mono.defer(() -> {
            try {
                UUID.fromString(jwt.getSubject());
            } catch (IllegalArgumentException | NullPointerException error) {
                return Mono.error(new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED",
                        "인증 상태를 확인해 주세요.", List.of()));
            }
            UUID id = parseId(submissionId);
            UUID key = parseId(requestKey);
            validation.validate(request.answers());
            return client.update(id, key, request, jwt.getTokenValue());
        });
    }

    private UUID parseId(String value) {
        try {
            UUID parsed = UUID.fromString(value);
            if (!parsed.toString().equalsIgnoreCase(value)) {
                throw new IllegalArgumentException();
            }
            return parsed;
        } catch (IllegalArgumentException | NullPointerException error) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST",
                    "입력 형식을 확인해 주세요.", List.of());
        }
    }
}
