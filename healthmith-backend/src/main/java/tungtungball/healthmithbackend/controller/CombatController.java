package tungtungball.healthmithbackend.controller;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JsonNode;
import tungtungball.healthmithbackend.dto.CombatRequest;
import tungtungball.healthmithbackend.dto.CombatResponse;
import tungtungball.healthmithbackend.dto.JourneyRequest;
import tungtungball.healthmithbackend.dto.JourneyResponse;
import tungtungball.healthmithbackend.service.CombatService;

@RestController
public class CombatController {
    private final CombatService service;
    public CombatController(CombatService service) { this.service=service; }
    @GetMapping("/api/spells")
    public Mono<CombatResponse.Catalog> catalog(@AuthenticationPrincipal Jwt jwt) {
        return service.query("spells",null,new CombatRequest.Empty(),jwt,CombatResponse.Catalog.class);
    }
    @GetMapping("/api/gems/{id}/spell-loadout")
    public Mono<CombatResponse.Loadout> loadout(@PathVariable String id,@AuthenticationPrincipal Jwt jwt) {
        return service.query("loadout",id,new CombatRequest.Empty(),jwt,CombatResponse.Loadout.class);
    }
    @PutMapping("/api/gems/{id}/spell-loadout")
    public Mono<CombatResponse.Loadout> replaceLoadout(@PathVariable String id,@Valid @RequestBody CombatRequest.Loadout request,@RequestHeader(value="Idempotency-Key",required=false) String key,@AuthenticationPrincipal Jwt jwt) {
        return service.command("loadout",id,key,request,jwt,CombatResponse.Loadout.class);
    }
    @GetMapping("/api/pve-encounters")
    public Mono<CombatResponse.Encounters> encounters(@AuthenticationPrincipal Jwt jwt) {
        return service.query("encounters",null,new CombatRequest.Empty(),jwt,CombatResponse.Encounters.class);
    }
    @PostMapping("/api/pve-battles")
    public Mono<ResponseEntity<CombatResponse.Battle>> pve(@Valid @RequestBody CombatRequest.Pve request,@RequestHeader(value="Idempotency-Key",required=false) String key,@AuthenticationPrincipal Jwt jwt) {
        return service.command("pve",null,key,request,jwt,CombatResponse.Battle.class).map(result -> ResponseEntity.status(201).body(result));
    }
    @PostMapping("/api/pvp-matchmaking-tickets")
    public Mono<ResponseEntity<CombatResponse.Ticket>> match(@Valid @RequestBody CombatRequest.Match request,@RequestHeader(value="Idempotency-Key",required=false) String key,@AuthenticationPrincipal Jwt jwt) {
        return service.command("match",null,key,request,jwt,CombatResponse.Ticket.class).map(result -> ResponseEntity.status(201).body(result));
    }
    @GetMapping("/api/pvp-matchmaking-tickets/current")
    public Mono<CombatResponse.CurrentTicket> currentTicket(@AuthenticationPrincipal Jwt jwt) {
        return service.query("current_ticket",null,new CombatRequest.Empty(),jwt,CombatResponse.CurrentTicket.class);
    }
    @GetMapping("/api/pvp-matchmaking-tickets/{id}")
    public Mono<CombatResponse.Ticket> ticket(@PathVariable String id,@AuthenticationPrincipal Jwt jwt) {
        return service.query("ticket",id,new CombatRequest.Empty(),jwt,CombatResponse.Ticket.class);
    }
    @PostMapping("/api/pvp-matchmaking-tickets/{id}/cancel")
    public Mono<CombatResponse.Ticket> cancel(@PathVariable String id,@Valid @RequestBody JourneyRequest.Version request,@RequestHeader(value="Idempotency-Key",required=false) String key,@AuthenticationPrincipal Jwt jwt) {
        return service.command("cancel_match",id,key,request,jwt,CombatResponse.Ticket.class);
    }
    @GetMapping("/api/me/battles/current")
    public Mono<CombatResponse.CurrentBattle> currentBattle(@AuthenticationPrincipal Jwt jwt) {
        return service.query("current_battle",null,new CombatRequest.Empty(),jwt,CombatResponse.CurrentBattle.class);
    }
    @GetMapping("/api/battles/{id}")
    public Mono<CombatResponse.Battle> battle(@PathVariable String id,@AuthenticationPrincipal Jwt jwt) {
        return service.query("battle",id,new CombatRequest.Empty(),jwt,CombatResponse.Battle.class);
    }
    @PostMapping("/api/battles/{id}/ready")
    public Mono<CombatResponse.Battle> ready(@PathVariable String id,@Valid @RequestBody JourneyRequest.Version request,@RequestHeader(value="Idempotency-Key",required=false) String key,@AuthenticationPrincipal Jwt jwt) {
        return service.command("ready",id,key,request,jwt,CombatResponse.Battle.class);
    }
    @PostMapping("/api/battles/{id}/surrender")
    public Mono<CombatResponse.Battle> surrender(@PathVariable String id,@Valid @RequestBody JourneyRequest.Version request,@RequestHeader(value="Idempotency-Key",required=false) String key,@AuthenticationPrincipal Jwt jwt) {
        return service.command("surrender",id,key,request,jwt,CombatResponse.Battle.class);
    }
    @PostMapping("/api/battles/{id}/casts")
    public Mono<CombatResponse.Cast> cast(@PathVariable String id,@Valid @RequestBody CombatRequest.Cast request,@RequestHeader(value="Idempotency-Key",required=false) String key,@AuthenticationPrincipal Jwt jwt) {
        return service.command("cast",id,key,request,jwt,CombatResponse.Cast.class);
    }
    @GetMapping("/api/battles/{id}/result")
    public Mono<CombatResponse.Result> result(@PathVariable String id,@AuthenticationPrincipal Jwt jwt) {
        return service.query("result",id,new CombatRequest.Empty(),jwt,CombatResponse.Result.class);
    }
    @GetMapping("/api/battles/{id}/casts/{castId}")
    public Mono<CombatResponse.Cast> castRead(@PathVariable String id,@PathVariable java.util.UUID castId,@AuthenticationPrincipal Jwt jwt) {
        return service.query("cast",id,new CombatRequest.CastQuery(castId),jwt,CombatResponse.Cast.class);
    }
    @GetMapping("/api/me/battle-records")
    public Mono<JourneyResponse.Page<CombatResponse.Result>> records(@RequestParam(required=false) Integer limit,@RequestParam(required=false) String cursor,@RequestParam(required=false) String mode,@AuthenticationPrincipal Jwt jwt) {
        return service.records(limit,cursor,mode,jwt);
    }
    @GetMapping(value="/api/battles/{id}/events",produces=MediaType.TEXT_EVENT_STREAM_VALUE)
    public Mono<ResponseEntity<Flux<ServerSentEvent<JsonNode>>>> events(@PathVariable String id,@RequestParam(value="after_event_id",required=false) String after,
            @RequestHeader(value="Last-Event-ID",required=false) String last,@AuthenticationPrincipal Jwt jwt) {
        return service.events(id,after,last,jwt).map(stream -> ResponseEntity.ok().header("Cache-Control","no-cache").header("X-Accel-Buffering","no").body(stream));
    }
}
