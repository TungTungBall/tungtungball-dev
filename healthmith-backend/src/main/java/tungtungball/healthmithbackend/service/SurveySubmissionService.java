package tungtungball.healthmithbackend.service;

import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.client.SurveySubmissionClient;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.dto.SurveySubmissionRequest;
import tungtungball.healthmithbackend.dto.SurveySubmissionResponse;

import java.util.List;
import java.util.UUID;

@Service
public class SurveySubmissionService {
    private final SurveySubmissionClient client;
    private final SurveyValidationService validation;

    public SurveySubmissionService(SurveySubmissionClient client, SurveyValidationService validation) {
        this.client = client;
        this.validation = validation;
    }

    public Mono<SurveySubmissionResponse> submit(SurveySubmissionRequest request, Jwt jwt) {
        return Mono.defer(() -> {
            UUID userId;
            try {
                userId = UUID.fromString(jwt.getSubject());
            } catch (IllegalArgumentException | NullPointerException error) {
                return Mono.error(new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED",
                        "인증 상태를 확인해 주세요.", List.of()));
            }
            validation.validate(request.answers());
            return client.insert(userId, jwt.getTokenValue(), request.answers());
        });
    }

}
