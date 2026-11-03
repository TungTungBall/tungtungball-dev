package tungtungball.healthmithbackend.client;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.codec.json.JacksonJsonDecoder;
import org.springframework.http.codec.json.JacksonJsonEncoder;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.dto.CurrentWorkoutResponse;
import tungtungball.healthmithbackend.dto.WorkoutSessionResponse;

import java.util.List;
import java.util.UUID;

@Component
public class WorkoutClient {
    private static final String FIELDS = "id,curriculum_id,status,current_stage_index,current_repetitions,completed_stage_count,version,stage_results,started_at,updated_at,ended_at,feedback_status";
    private final WebClient client;
    public WorkoutClient(@Qualifier("supabaseWebClient") WebClient client, JsonMapper mapper) {
        this.client = client.mutate().codecs(codecs -> {
            codecs.defaultCodecs().jacksonJsonEncoder(new JacksonJsonEncoder(mapper));
            codecs.defaultCodecs().jacksonJsonDecoder(new JacksonJsonDecoder(mapper));
        }).build();
    }

    private Mono<WorkoutSessionResponse[]> rows(UUID id, UUID owner, String token) {
        return client.get().uri(builder -> {
            builder.path("/workout_sessions").queryParam("select", FIELDS)
                    .queryParam("user_id", "eq." + owner).queryParam("limit", 2);
            if (id == null) { builder.queryParam("status", "in.(in_progress,paused)"); }
            else { builder.queryParam("id", "eq." + id); }
            return builder.build();
        }).header(HttpHeaders.AUTHORIZATION, "Bearer " + token).retrieve().bodyToMono(WorkoutSessionResponse[].class)
                .switchIfEmpty(Mono.error(failed())).onErrorMap(error -> error instanceof ApiException ? error : failed());
    }

    public Mono<CurrentWorkoutResponse> current(UUID owner, String token) {
        return rows(null, owner, token).flatMap(rows -> {
            if (rows.length == 0) { return Mono.just(new CurrentWorkoutResponse(null)); }
            return rows.length == 1 && rows[0] != null ? Mono.just(new CurrentWorkoutResponse(rows[0])) : Mono.error(failed());
        });
    }

    public Mono<WorkoutSessionResponse> read(UUID id, UUID owner, String token) {
        return rows(id, owner, token).flatMap(rows -> {
            if (rows.length == 0) { return Mono.error(notFound()); }
            return rows.length == 1 && rows[0] != null ? Mono.just(rows[0]) : Mono.error(failed());
        });
    }

    public Mono<WorkoutSessionResponse> change(UUID id, long version, String command, String reason, UUID key, String token) {
        return client.post().uri("/rpc/change_workout_state").header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .bodyValue(new Command(id, version, command, reason, key)).retrieve().bodyToMono(Result.class)
                .switchIfEmpty(Mono.error(failed())).flatMap(result -> {
                    if ("UPDATED".equals(result.outcome()) && result.session() != null) { return Mono.just(result.session()); }
                    if (result.session() != null || result.outcome() == null) { return Mono.error(failed()); }
                    return Mono.error(switch (result.outcome()) {
                        case "UNAUTHORIZED" -> new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "인증 상태를 확인해 주세요.", List.of());
                        case "RESOURCE_NOT_FOUND" -> notFound();
                        case "INVALID_INPUT" -> new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "입력 형식을 확인해 주세요.", List.of());
                        case "VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT", "INVALID_STATE" -> new ApiException(
                                HttpStatus.CONFLICT, result.outcome(), "현재 상태와 요청 내용을 확인해 주세요.", List.of());
                        default -> failed();
                    });
                }).onErrorMap(error -> error instanceof ApiException ? error : failed());
    }

    public static ApiException failed() {
        return new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", List.of());
    }
    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "요청한 리소스를 찾을 수 없습니다.", List.of());
    }
    private record Command(UUID pSessionId, long pExpectedVersion, String pCommand, String pReason, UUID pIdempotencyKey) { }
    private record Result(String outcome, WorkoutSessionResponse session) { }
}
