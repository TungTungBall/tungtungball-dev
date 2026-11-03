package tungtungball.healthmithbackend.controller;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.dto.GenerationRequestResponse;
import tungtungball.healthmithbackend.dto.GenerationWorkflowResponse;
import tungtungball.healthmithbackend.dto.JourneyRequest;
import tungtungball.healthmithbackend.service.GenerationWorkflowService;
import java.net.URI;

@RestController
public class GenerationWorkflowController {
    private final GenerationWorkflowService service;
    public GenerationWorkflowController(GenerationWorkflowService service) { this.service=service; }
    @PostMapping("/api/curricula/{id}/regenerations")
    public Mono<ResponseEntity<GenerationRequestResponse>> regenerate(@PathVariable String id,@Valid @RequestBody JourneyRequest.Version request,
            @RequestHeader(value="Idempotency-Key",required=false) String key,@AuthenticationPrincipal Jwt jwt) {
        return service.execute("regeneration",id,key,request,jwt,GenerationRequestResponse.class).map(result -> ResponseEntity.accepted().location(URI.create("/api/curriculum-generation-requests/"+result.id())).body(result));
    }
    @PostMapping("/api/feedback/{id}/next-curriculum-generation-requests")
    public Mono<ResponseEntity<GenerationRequestResponse>> next(@PathVariable String id,@RequestBody GenerationWorkflowResponse.Empty request,
            @RequestHeader(value="Idempotency-Key",required=false) String key,@AuthenticationPrincipal Jwt jwt) {
        return service.execute("next",id,key,request,jwt,GenerationRequestResponse.class).map(result -> ResponseEntity.accepted().location(URI.create("/api/curriculum-generation-requests/"+result.id())).body(result));
    }
    @GetMapping("/api/me/workout-tendency")
    public Mono<GenerationWorkflowResponse.Tendency> tendency(@AuthenticationPrincipal Jwt jwt) {
        return service.execute("tendency",null,null,new GenerationWorkflowResponse.Empty(),jwt,GenerationWorkflowResponse.Tendency.class);
    }
    @PostMapping("/api/me/workout-tendency/generation-requests")
    public Mono<ResponseEntity<GenerationWorkflowResponse.Accepted>> summary(@RequestBody GenerationWorkflowResponse.Empty request,
            @RequestHeader(value="Idempotency-Key",required=false) String key,@AuthenticationPrincipal Jwt jwt) {
        return service.execute("summary",null,key,request,jwt,GenerationWorkflowResponse.Accepted.class).map(result -> ResponseEntity.accepted().location(URI.create("/api/workout-tendency-generation-requests/"+result.id())).body(result));
    }
    @GetMapping("/api/workout-tendency-generation-requests/{id}")
    public Mono<GenerationWorkflowResponse.Job> job(@PathVariable String id,@AuthenticationPrincipal Jwt jwt) {
        return service.execute("tendency_job",id,null,new GenerationWorkflowResponse.Empty(),jwt,GenerationWorkflowResponse.Job.class);
    }
}
