package tungtungball.healthmithbackend.controller;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.dto.CurriculumResponse;
import tungtungball.healthmithbackend.dto.ExerciseListResponse;
import tungtungball.healthmithbackend.dto.GenerationCreateRequest;
import tungtungball.healthmithbackend.dto.GenerationRequestResponse;
import tungtungball.healthmithbackend.service.GenerationService;

import java.net.URI;

@RestController
public class GenerationController {
    private final GenerationService service;

    public GenerationController(GenerationService service) {
        this.service = service;
    }

    @GetMapping("/api/exercises")
    public Mono<ExerciseListResponse> exercises(@AuthenticationPrincipal Jwt jwt) {
        return service.exercises(jwt);
    }

    @PostMapping("/api/curriculum-generation-requests")
    public Mono<ResponseEntity<GenerationRequestResponse>> create(
            @Valid @RequestBody GenerationCreateRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false) String key, @AuthenticationPrincipal Jwt jwt) {
        return service.create(request, key, jwt).map(result -> ResponseEntity.accepted()
                .location(URI.create("/api/curriculum-generation-requests/" + result.id())).body(result));
    }

    @GetMapping("/api/curriculum-generation-requests/{request_id}")
    public Mono<GenerationRequestResponse> request(@PathVariable("request_id") String id, @AuthenticationPrincipal Jwt jwt) {
        return service.request(id, jwt);
    }

    @GetMapping("/api/curricula/{curriculum_id}")
    public Mono<CurriculumResponse> curriculum(@PathVariable("curriculum_id") String id, @AuthenticationPrincipal Jwt jwt) {
        return service.curriculum(id, jwt);
    }
}
