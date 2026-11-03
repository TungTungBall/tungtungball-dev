package tungtungball.healthmithbackend.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.config.error.ApiInputErrorCode;
import tungtungball.healthmithbackend.dto.SurveySubmissionRequest;
import tungtungball.healthmithbackend.dto.SurveySubmissionResponse;
import tungtungball.healthmithbackend.service.SurveySubmissionService;

@RestController
public class SurveySubmissionController {
    private final SurveySubmissionService service;

    public SurveySubmissionController(SurveySubmissionService service) {
        this.service = service;
    }

    @PostMapping("/api/survey-submissions")
    @ResponseStatus(HttpStatus.CREATED)
    @ApiInputErrorCode("INVALID_SURVEY")
    public Mono<SurveySubmissionResponse> submit(
            @Valid @RequestBody SurveySubmissionRequest request, @AuthenticationPrincipal Jwt jwt) {
        return service.submit(request, jwt);
    }
}
