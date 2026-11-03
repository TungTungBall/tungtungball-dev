package tungtungball.healthmithbackend.service;

import org.springframework.stereotype.Service;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.http.codec.ServerSentEvent;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.client.CombatClient;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.dto.CombatRequest;
import tungtungball.healthmithbackend.dto.CombatResponse;
import tungtungball.healthmithbackend.dto.JourneyResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.Base64;

@Service
public class CombatService {
    private final CombatClient client;
    private final JsonMapper mapper;
    public CombatService(CombatClient client,JsonMapper mapper) { this.client=client;this.mapper=mapper; }
    public <T> Mono<T> command(String operation,String id,String key,Object payload,Jwt jwt,Class<T> type) {
        return Mono.defer(() -> {
            owner(jwt);UUID requestKey=uuid(key);
            if (payload instanceof CombatRequest.Cast cast && !requestKey.equals(cast.clientCastId())) { throw CombatClient.error("INVALID_INPUT"); }
            return client.command(operation,id==null ? null : uuid(id),requestKey,payload,jwt.getTokenValue(),mapper.constructType(type));
        });
    }
    public <T> Mono<T> query(String operation,String id,Object payload,Jwt jwt,Class<T> type) {
        return Mono.defer(() -> { owner(jwt);return client.query(operation,id==null ? null : uuid(id),payload,jwt.getTokenValue(),mapper.constructType(type)); });
    }
    public Mono<JourneyResponse.Page<CombatResponse.Result>> records(Integer limit,String cursor,String mode,Jwt jwt) {
        return Mono.defer(() -> {
            UUID owner=owner(jwt);int n=limit==null ? 20 : limit;
            if (n<1 || n>50 || (mode!=null && !mode.equals("pvp") && !mode.equals("pve"))) { throw CombatClient.error("INVALID_INPUT"); }
            JourneyResponse.Cursor position=null;
            if (cursor!=null) {
                try {
                    if (cursor.length()>2048 || !cursor.matches("[A-Za-z0-9_-]+")) { throw new IllegalArgumentException(); }
                    position=mapper.readValue(Base64.getUrlDecoder().decode(cursor),JourneyResponse.Cursor.class);
                    if (position==null || !owner.equals(position.owner()) || !("battles:"+(mode==null ? "all" : mode)).equals(position.operation()) || position.id()==null || position.time()==null) { throw new IllegalArgumentException(); }
                } catch (RuntimeException error) { throw CombatClient.error("INVALID_INPUT"); }
            }
            return client.query("records",null,new PagePayload(n,position,mode),jwt.getTokenValue(),mapper.getTypeFactory().constructParametricType(JourneyResponse.Page.class,CombatResponse.Result.class));
        });
    }
    public Mono<Flux<ServerSentEvent<tools.jackson.databind.JsonNode>>> events(String id,String after,String last,Jwt jwt) {
        return Mono.defer(() -> {
            if ((after!=null && last!=null && !after.equals(last)) || (after==null && last==null)) { throw CombatClient.error("INVALID_INPUT"); }
            String cursor=after==null ? last : after;
            try { if (!cursor.matches("0|[1-9][0-9]*") || Long.parseLong(cursor)<0) { throw new IllegalArgumentException(); } }
            catch (RuntimeException error) { throw CombatClient.error("INVALID_INPUT"); }
            return eventPage(id,cursor,jwt).map(first -> {
                Duration remaining=Duration.between(Instant.now(),jwt.getExpiresAt());
                if (remaining.isNegative() || remaining.isZero()) { throw CombatClient.error("UNAUTHORIZED"); }
                return Mono.just(first).expand(page -> {
                    if (Boolean.TRUE.equals(page.terminal())) { return Mono.empty(); }
                    if (page.pollIntervalMs()==null || page.pollIntervalMs()<1) { return Mono.error(CombatClient.error("INTERNAL_ERROR")); }
                    return Mono.delay(Duration.ofMillis(page.pollIntervalMs())).then(eventPage(id,page.nextEventId(),jwt));
                }).concatMap(page -> {
                    if (page.events()==null) { return Flux.error(CombatClient.error("INTERNAL_ERROR")); }
                    if (page.events().isEmpty()) { return Flux.just(ServerSentEvent.<tools.jackson.databind.JsonNode>builder().comment("heartbeat").build()); }
                    return Flux.fromIterable(page.events()).map(event -> ServerSentEvent.builder(event.data()).id(event.id()).event(event.event()).build());
                }).takeUntilOther(Mono.delay(remaining)).onErrorResume(error -> error instanceof ApiException api && "EVENT_CURSOR_EXPIRED".equals(api.getCode())
                        ? Flux.just(ServerSentEvent.<tools.jackson.databind.JsonNode>builder().event("resync_required").data(mapper.createObjectNode()).build()) : Flux.empty());
            });
        });
    }
    private Mono<CombatResponse.Events> eventPage(String id,String after,Jwt jwt) {
        if (jwt.getExpiresAt()==null || !Instant.now().isBefore(jwt.getExpiresAt())) { return Mono.error(CombatClient.error("UNAUTHORIZED")); }
        return query("events",id,new CombatRequest.EventQuery(after),jwt,CombatResponse.Events.class);
    }
    private UUID owner(Jwt jwt) { try { return UUID.fromString(jwt.getSubject()); } catch (RuntimeException error) { throw CombatClient.error("UNAUTHORIZED"); } }
    private UUID uuid(String value) {
        try { UUID id=UUID.fromString(value);if (!id.toString().equalsIgnoreCase(value)) { throw new IllegalArgumentException(); }return id; }
        catch (RuntimeException error) { throw CombatClient.error("INVALID_INPUT"); }
    }
    private record PagePayload(int limit,JourneyResponse.Cursor cursor,String mode) { }
}
