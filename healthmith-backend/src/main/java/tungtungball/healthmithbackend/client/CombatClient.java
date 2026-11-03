package tungtungball.healthmithbackend.client;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.codec.json.JacksonJsonDecoder;
import org.springframework.http.codec.json.JacksonJsonEncoder;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.JavaType;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.config.error.ApiException;
import java.util.List;
import java.util.UUID;

@Component
public class CombatClient {
    private final WebClient client;
    private final JsonMapper mapper;
    public CombatClient(@Qualifier("supabaseWebClient") WebClient client, JsonMapper mapper) {
        this.mapper=mapper;
        this.client=client.mutate().codecs(codecs -> {
            codecs.defaultCodecs().jacksonJsonEncoder(new JacksonJsonEncoder(mapper));
            codecs.defaultCodecs().jacksonJsonDecoder(new JacksonJsonDecoder(mapper));
        }).build();
    }
    public <T> Mono<T> command(String operation, UUID id, UUID key, Object payload, String token, JavaType type) {
        return call("combat_command",new Command(operation,id,key,mapper.valueToTree(payload)),token,type);
    }
    public <T> Mono<T> query(String operation, UUID id, Object payload, String token, JavaType type) {
        return call("combat_query",new Query(operation,id,mapper.valueToTree(payload)),token,type);
    }
    private <T> Mono<T> call(String rpc, Object body, String token, JavaType type) {
        return client.post().uri("/rpc/"+rpc).header(HttpHeaders.AUTHORIZATION,"Bearer "+token).bodyValue(body)
                .retrieve().bodyToMono(Envelope.class).switchIfEmpty(Mono.error(error("INTERNAL_ERROR")))
                .flatMap(envelope -> {
                    if ("OK".equals(envelope.outcome()) && envelope.data()!=null && !envelope.data().isNull()) {
                        T value=mapper.convertValue(envelope.data(),type);
                        return value==null ? Mono.error(error("INTERNAL_ERROR")) : Mono.just(value);
                    }
                    if (envelope.data()!=null && !envelope.data().isNull()) { return Mono.error(error("INTERNAL_ERROR")); }
                    return Mono.error(error(envelope.outcome()));
                }).onErrorMap(error -> error instanceof ApiException ? error : error("INTERNAL_ERROR"));
    }
    public static ApiException error(String code) {
        HttpStatus status=switch(code==null ? "" : code) {
            case "UNAUTHORIZED" -> HttpStatus.UNAUTHORIZED;
            case "RESOURCE_NOT_FOUND" -> HttpStatus.NOT_FOUND;
            case "INVALID_INPUT", "INVALID_FEEDBACK" -> HttpStatus.BAD_REQUEST;
            case "VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT", "NOT_CURRENT_DRAFT", "INVALID_STATE", "FEEDBACK_ALREADY_SUBMITTED", "GEM_NOT_AVAILABLE", "ACTIVE_BATTLE_EXISTS", "ACTIVE_MATCHMAKING_EXISTS", "MATCH_ALREADY_FOUND", "ENCOUNTER_UNAVAILABLE", "SPELL_NOT_AVAILABLE", "RUNE_VERSION_MISMATCH", "INSUFFICIENT_MANA", "COOLDOWN_ACTIVE", "CAST_SEQUENCE_CONFLICT", "EVENT_CURSOR_EXPIRED", "BATTLE_NOT_ACTIVE", "BATTLE_NOT_FINISHED" -> HttpStatus.CONFLICT;
            case "RATE_LIMITED" -> HttpStatus.TOO_MANY_REQUESTS;
            case "POLICY_NOT_CONFIGURED", "GENERATION_UNAVAILABLE" -> HttpStatus.SERVICE_UNAVAILABLE;
            default -> HttpStatus.INTERNAL_SERVER_ERROR;
        };
        String wireCode= status==HttpStatus.INTERNAL_SERVER_ERROR ? "INTERNAL_ERROR" : "INVALID_INPUT".equals(code) ? "INVALID_REQUEST" : code;
        return new ApiException(status,wireCode,"요청 상태와 입력을 확인해 주세요.",List.of());
    }
    private record Envelope(String outcome, JsonNode data) { }
    private record Command(String pOperation, UUID pResourceId, UUID pKey, JsonNode pPayload) { }
    private record Query(String pOperation, UUID pResourceId, JsonNode pPayload) { }
}
