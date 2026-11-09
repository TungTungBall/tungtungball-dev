package tungtungball.healthmithbackend.controller;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.dto.SurveySubmissionDetailResponse;
import tungtungball.healthmithbackend.service.SurveySubmissionQueryService;

@RestController
public class SurveySubmissionQueryController {
    private final SurveySubmissionQueryService service;

    public SurveySubmissionQueryController(SurveySubmissionQueryService service) {
        this.service = service;
    }

    @GetMapping("/api/survey-submissions/{submission_id}")
    public Mono<SurveySubmissionDetailResponse> find(
            @PathVariable("submission_id") String submissionId, @AuthenticationPrincipal Jwt jwt) {
        return service.find(submissionId, jwt);
    }
}
