package tungtungball.healthmithbackend.controller;

import jakarta.validation.Valid;
import tungtungball.healthmithbackend.config.error.ApiInputErrorCode;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.dto.CurriculumResponse;
import tungtungball.healthmithbackend.dto.WorkoutSessionResponse;
import tungtungball.healthmithbackend.dto.JourneyRequest;
import tungtungball.healthmithbackend.dto.JourneyResponse;
import tungtungball.healthmithbackend.service.JourneyService;

@RestController
public class JourneyController {
    private final JourneyService service;
    public JourneyController(JourneyService service) { this.service=service; }
    @PostMapping("/api/curricula/{id}/confirmations")
    public Mono<CurriculumResponse> confirm(@PathVariable String id,@Valid @RequestBody JourneyRequest.Version request,
            @RequestHeader(value="Idempotency-Key",required=false) String key,@AuthenticationPrincipal Jwt jwt) {
        return service.command("confirm",id,key,request,jwt,CurriculumResponse.class);
    }
    @PostMapping("/api/workout-sessions")
    public Mono<ResponseEntity<WorkoutSessionResponse>> start(@Valid @RequestBody JourneyRequest.Start request,
            @RequestHeader(value="Idempotency-Key",required=false) String key,@AuthenticationPrincipal Jwt jwt) {
        return service.start(request,key,jwt).map(result -> ResponseEntity.status(201).body(result));
    }
    @PostMapping("/api/workout-sessions/{id}/repetitions")
    public Mono<JourneyResponse.Repetition> repetition(@PathVariable String id,@Valid @RequestBody JourneyRequest.Repetition request,@AuthenticationPrincipal Jwt jwt) {
        return service.repetition(id,request,jwt);
    }
    @GetMapping("/api/workout-sessions/{id}/result")
    public Mono<JourneyResponse.Result> result(@PathVariable String id,@AuthenticationPrincipal Jwt jwt) { return service.query("result",id,jwt,JourneyResponse.Result.class); }
    @ApiInputErrorCode("INVALID_FEEDBACK")
    @PostMapping("/api/workout-sessions/{id}/feedback")
    public Mono<ResponseEntity<JourneyResponse.FeedbackSaved>> feedback(@PathVariable String id,@Valid @RequestBody JourneyRequest.Feedback request,
            @RequestHeader(value="Idempotency-Key",required=false) String key,@AuthenticationPrincipal Jwt jwt) {
        return service.feedback(id,request,key,jwt).map(result -> ResponseEntity.status(201).body(result));
    }
    @GetMapping("/api/workout-sessions/{id}/feedback")
    public Mono<JourneyResponse.FeedbackRead> feedback(@PathVariable String id,@AuthenticationPrincipal Jwt jwt) { return service.query("feedback",id,jwt,JourneyResponse.FeedbackRead.class); }
    @GetMapping("/api/me/workout-records")
    public Mono<JourneyResponse.Page<JourneyResponse.Record>> records(@RequestParam(required=false) Integer limit,@RequestParam(required=false) String cursor,@AuthenticationPrincipal Jwt jwt) {
        return service.page("records",limit,cursor,jwt,JourneyResponse.Record.class);
    }
    @GetMapping("/api/me/workout-stats")
    public Mono<JourneyResponse.Stats> stats(@AuthenticationPrincipal Jwt jwt) { return service.query("stats",null,jwt,JourneyResponse.Stats.class); }
    @GetMapping("/api/me/gems")
    public Mono<JourneyResponse.Page<JourneyResponse.Gem>> gems(@RequestParam(required=false) Integer limit,@RequestParam(required=false) String cursor,@AuthenticationPrincipal Jwt jwt) {
        return service.page("gems",limit,cursor,jwt,JourneyResponse.Gem.class);
    }
    @GetMapping("/api/gems/{id}")
    public Mono<JourneyResponse.Gem> gem(@PathVariable String id,@AuthenticationPrincipal Jwt jwt) { return service.query("gem",id,jwt,JourneyResponse.Gem.class); }
}
