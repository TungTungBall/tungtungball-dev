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
import tungtungball.healthmithbackend.dto.CurriculumResponse;
import tungtungball.healthmithbackend.dto.ExerciseListResponse;
import tungtungball.healthmithbackend.dto.GenerationRequestResponse;

import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@Component
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="app.persistence.mode", havingValue="postgrest")
public class GenerationClient implements tungtungball.healthmithbackend.repository.GenerationStore {
    private final WebClient client;

    public GenerationClient(@Qualifier("supabaseWebClient") WebClient client, JsonMapper mapper) {
        this.client = client.mutate().codecs(codecs -> {
            codecs.defaultCodecs().jacksonJsonEncoder(new JacksonJsonEncoder(mapper));
            codecs.defaultCodecs().jacksonJsonDecoder(new JacksonJsonDecoder(mapper));
        }).build();
    }

    public Mono<ExerciseListResponse> exercises(String token) {
        return client.get().uri(builder -> builder.path("/exercise_catalog")
                        .queryParam("select", "id,name,body_parts,internal_focus_instruction")
                        .queryParam("enabled", "eq.true").queryParam("order", "id.asc").build())
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token).retrieve()
                .bodyToMono(ExerciseListResponse.Exercise[].class)
                .switchIfEmpty(Mono.error(readFailed()))
                .map(rows -> new ExerciseListResponse(Arrays.asList(rows)))
                .onErrorMap(error -> error instanceof ApiException ? error : readFailed());
    }

    public Mono<GenerationRequestResponse> create(UUID submission, UUID key, String token) {
        return client.post().uri("/rpc/create_initial_generation")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .bodyValue(new CreateCommand(submission, key)).retrieve().bodyToMono(CreateResult.class)
                .switchIfEmpty(Mono.error(unavailable()))
                .flatMap(result -> {
                    if ("ACCEPTED".equals(result.outcome()) && result.request() != null) {
                        return Mono.just(result.request());
                    }
                    if (result.request() != null || result.outcome() == null) {
                        return Mono.error(unavailable());
                    }
                    return Mono.error(switch (result.outcome()) {
                        case "UNAUTHORIZED" -> new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED",
                                "인증 상태를 확인해 주세요.", List.of());
                        case "RESOURCE_NOT_FOUND" -> notFound();
                        case "INVALID_INPUT" -> new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST",
                                "입력 형식을 확인해 주세요.", List.of());
                        case "NO_ELIGIBLE_EXERCISE", "INVALID_STATE", "IDEMPOTENCY_CONFLICT" ->
                                new ApiException(HttpStatus.CONFLICT, result.outcome(),
                                        "생성에 필요한 입력과 현재 상태를 확인해 주세요.", List.of());
                        default -> unavailable();
                    });
                }).onErrorMap(error -> error instanceof ApiException ? error : unavailable());
    }

    public Mono<GenerationRequestResponse> request(UUID id, UUID owner, String token) {
        return readOwned("/curriculum_generation_requests", "id,kind,status,curriculum_id,error,created_at,updated_at",
                id, owner, token, GenerationRequestResponse[].class, false);
    }

    public Mono<CurriculumResponse> curriculum(UUID id, UUID owner, String token) {
        return readOwned("/curricula", "id,survey_submission_id,previous_curriculum_id,status,version,stages,created_at,confirmed_at",
                id, owner, token, CurriculumResponse[].class, true);
    }

    private <T> Mono<T> readOwned(String path, String fields, UUID id, UUID owner, String token,
                                  Class<T[]> responseType, boolean validatedOnly) {
        return client.get().uri(builder -> {
                    builder.path(path).queryParam("select", fields).queryParam("id", "eq." + id)
                            .queryParam("user_id", "eq." + owner).queryParam("limit", 2);
                    if (validatedOnly) {
                        builder.queryParam("validated", "eq.true");
                    }
                    return builder.build();
                }).header(HttpHeaders.AUTHORIZATION, "Bearer " + token).retrieve().bodyToMono(responseType)
                .switchIfEmpty(Mono.error(readFailed()))
                .flatMap(rows -> {
                    if (rows.length == 0) {
                        return Mono.error(notFound());
                    }
                    return rows.length == 1 && rows[0] != null ? Mono.just(rows[0]) : Mono.error(readFailed());
                }).onErrorMap(error -> error instanceof ApiException ? error : readFailed());
    }

    public static ApiException readFailed() {
        return new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", List.of());
    }

    public static ApiException unavailable() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "GENERATION_UNAVAILABLE",
                "생성 요청을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.", List.of());
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND",
                "요청한 리소스를 찾을 수 없습니다.", List.of());
    }

    private record CreateCommand(UUID pSubmissionId, UUID pIdempotencyKey) {
    }

    private record CreateResult(String outcome, GenerationRequestResponse request) {
    }
}
