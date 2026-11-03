package tungtungball.healthmithbackend.controller;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.dto.CurrentWorkoutResponse;
import tungtungball.healthmithbackend.dto.WorkoutSessionResponse;
import tungtungball.healthmithbackend.dto.WorkoutPauseRequest;
import tungtungball.healthmithbackend.dto.WorkoutStateRequest;
import tungtungball.healthmithbackend.service.WorkoutService;

@RestController
@RequestMapping("/api/workout-sessions")
public class WorkoutController {
    private final WorkoutService service;
    public WorkoutController(WorkoutService service) { this.service = service; }

    @GetMapping("/current")
    public Mono<CurrentWorkoutResponse> current(@AuthenticationPrincipal Jwt jwt) { return service.current(jwt); }

    @GetMapping("/{session_id}")
    public Mono<WorkoutSessionResponse> read(@PathVariable("session_id") String id, @AuthenticationPrincipal Jwt jwt) {
        return service.read(id, jwt);
    }

    @PostMapping("/{session_id}/pause")
    public Mono<WorkoutSessionResponse> pause(@PathVariable("session_id") String id,
            @Valid @RequestBody WorkoutPauseRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false) String key, @AuthenticationPrincipal Jwt jwt) {
        return service.change(id, request.expectedVersion(), "pause", request.reason(), key, jwt);
    }

    @PostMapping("/{session_id}/resume")
    public Mono<WorkoutSessionResponse> resume(@PathVariable("session_id") String id,
            @Valid @RequestBody WorkoutStateRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false) String key, @AuthenticationPrincipal Jwt jwt) {
        return service.change(id, request.expectedVersion(), "resume", null, key, jwt);
    }

    @PostMapping("/{session_id}/abandon")
    public Mono<WorkoutSessionResponse> abandon(@PathVariable("session_id") String id,
            @Valid @RequestBody WorkoutStateRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false) String key, @AuthenticationPrincipal Jwt jwt) {
        return service.change(id, request.expectedVersion(), "abandon", null, key, jwt);
    }
}
