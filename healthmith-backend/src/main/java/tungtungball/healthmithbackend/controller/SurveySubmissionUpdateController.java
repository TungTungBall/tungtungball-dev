package tungtungball.healthmithbackend.controller;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.config.error.ApiInputErrorCode;
import tungtungball.healthmithbackend.dto.SurveySubmissionDetailResponse;
import tungtungball.healthmithbackend.dto.SurveySubmissionUpdateRequest;
import tungtungball.healthmithbackend.service.SurveySubmissionUpdateService;

@RestController
public class SurveySubmissionUpdateController {
    private final SurveySubmissionUpdateService service;

    public SurveySubmissionUpdateController(SurveySubmissionUpdateService service) {
        this.service = service;
    }

    @PatchMapping("/api/survey-submissions/{submission_id}")
    @ApiInputErrorCode("INVALID_SURVEY")
    public Mono<SurveySubmissionDetailResponse> update(
            @PathVariable("submission_id") String submissionId,
            @RequestHeader(value = "Idempotency-Key", required = false) String requestKey,
            @Valid @RequestBody SurveySubmissionUpdateRequest request, @AuthenticationPrincipal Jwt jwt) {
        return service.update(submissionId, requestKey, request, jwt);
    }
}
