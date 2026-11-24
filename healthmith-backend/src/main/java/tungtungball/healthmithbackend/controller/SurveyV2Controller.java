package tungtungball.healthmithbackend.controller;

import jakarta.validation.Valid;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.config.error.ApiInputErrorCode;
import tungtungball.healthmithbackend.dto.SurveyV2;
import tungtungball.healthmithbackend.service.SurveyV2Service;

@RestController
@RequestMapping("/api/v2/survey-submissions")
@ConditionalOnProperty(name="app.persistence.mode", havingValue="r2dbc", matchIfMissing=true)
public class SurveyV2Controller {
    private final SurveyV2Service service;
    public SurveyV2Controller(SurveyV2Service service) { this.service = service; }
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @ApiInputErrorCode("INVALID_SURVEY")
    public Mono<SurveyV2.Detail> create(@Valid @RequestBody SurveyV2.Create request,
            @RequestHeader(value="Idempotency-Key", required=false) String key) {
        return service.save(null, null, key, request.answers());
    }
    @GetMapping("/latest")
    public Mono<SurveyV2.Detail> latest() { return service.latest(); }
    @GetMapping("/{id}")
    public Mono<SurveyV2.Detail> find(@PathVariable String id) { return service.find(id); }
    @PatchMapping("/{id}")
    @ApiInputErrorCode("INVALID_SURVEY")
    public Mono<SurveyV2.Detail> update(@PathVariable String id, @Valid @RequestBody SurveyV2.Update request,
            @RequestHeader(value="Idempotency-Key", required=false) String key) {
        return service.save(id, request.expectedVersion(), key, request.answers());
    }
}
