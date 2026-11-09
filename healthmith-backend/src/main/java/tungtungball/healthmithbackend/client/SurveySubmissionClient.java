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
import tungtungball.healthmithbackend.dto.SurveySubmissionRequest;
import tungtungball.healthmithbackend.dto.SurveySubmissionResponse;
import tungtungball.healthmithbackend.dto.SurveySubmissionDetailResponse;
import tungtungball.healthmithbackend.dto.SurveySubmissionUpdateRequest;

import java.util.List;
import java.util.UUID;

@Component
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="app.persistence.mode", havingValue="postgrest")
public class SurveySubmissionClient implements tungtungball.healthmithbackend.repository.SurveySubmissionStore {
    private final WebClient webClient;

    public SurveySubmissionClient(@Qualifier("supabaseWebClient") WebClient webClient, JsonMapper mapper) {
        // 공유 클라이언트의 주소·키·타임아웃은 유지하고 서버의 엄격한 snake_case mapper를 적용한다.
        this.webClient = webClient.mutate().codecs(codecs -> {
            codecs.defaultCodecs().jacksonJsonEncoder(new JacksonJsonEncoder(mapper));
            codecs.defaultCodecs().jacksonJsonDecoder(new JacksonJsonDecoder(mapper));
        }).build();
    }

    public Mono<SurveySubmissionResponse> insert(
            UUID userId, String accessToken, SurveySubmissionRequest.Answers answers) {
        // id·created_at은 DB 기본값이다. 컬럼 INSERT 권한과 RLS를 우회하지 않는다.
        return webClient.post()
                .uri("/survey_submissions?select=id,answers,generation_request_status,created_at")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .header("Prefer", "return=representation")
                .bodyValue(new InsertRequest(userId, answers, "prepared"))
                .retrieve()
                .bodyToMono(SurveySubmissionResponse[].class)
                .filter(rows -> rows.length == 1)
                .map(rows -> rows[0])
                .filter(row -> row.id() != null && row.createdAt() != null
                        && answers.equals(row.answers()) && "prepared".equals(row.generationRequestStatus()))
                .switchIfEmpty(Mono.error(saveFailed()))
                .onErrorMap(error -> saveFailed());
    }

    public Mono<SurveySubmissionDetailResponse> find(UUID id, UUID owner, String accessToken) {
        return webClient.get()
                .uri(builder -> builder.path("/survey_submissions")
                        .queryParam("select", "id,answers,generation_request_status,created_at,version")
                        .queryParam("id", "eq." + id)
                        .queryParam("user_id", "eq." + owner)
                        .queryParam("limit", 2).build())
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .retrieve()
                .bodyToMono(SurveySubmissionDetailResponse[].class)
                .switchIfEmpty(Mono.error(readFailed()))
                .flatMap(rows -> {
                    if (rows.length == 0) {
                        return Mono.error(new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND",
                                "요청한 리소스를 찾을 수 없습니다.", List.of()));
                    }
                    if (rows.length != 1) {
                        return Mono.error(readFailed());
                    }
                    SurveySubmissionDetailResponse row = rows[0];
                    if (row == null || !id.equals(row.id()) || row.answers() == null || row.createdAt() == null
                            || row.version() == null || row.version() < 1
                            || !"prepared".equals(row.generationRequestStatus())) {
                        return Mono.error(readFailed());
                    }
                    return Mono.just(row);
                })
                .onErrorMap(error -> error instanceof ApiException ? error : readFailed());
    }

    public Mono<SurveySubmissionDetailResponse> update(
            UUID id, UUID key, SurveySubmissionUpdateRequest request, String accessToken) {
        return webClient.post().uri("/rpc/update_survey_submission")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .bodyValue(new UpdateCommand(id, request.expectedVersion(), request.answers(), key))
                .retrieve().bodyToMono(UpdateResult.class)
                .switchIfEmpty(Mono.error(saveFailed()))
                .flatMap(result -> {
                    if ("UPDATED".equals(result.outcome())) {
                        SurveySubmissionDetailResponse row = result.submission();
                        if (row == null || !id.equals(row.id()) || !request.answers().equals(row.answers())
                                || row.createdAt() == null || row.version() == null
                                || request.expectedVersion() == Long.MAX_VALUE
                                || row.version() != request.expectedVersion() + 1
                                || !"prepared".equals(row.generationRequestStatus())) {
                            return Mono.error(saveFailed());
                        }
                        return Mono.just(row);
                    }
                    if (result.submission() != null) {
                        return Mono.error(saveFailed());
                    }
                    return Mono.error(updateFailure(result.outcome()));
                })
                .onErrorMap(error -> error instanceof ApiException ? error : saveFailed());
    }

    private ApiException updateFailure(String outcome) {
        if (outcome == null) {
            return saveFailed();
        }
        return switch (outcome) {
            case "UNAUTHORIZED" -> new ApiException(HttpStatus.UNAUTHORIZED, outcome,
                    "인증 상태를 확인해 주세요.", List.of());
            case "RESOURCE_NOT_FOUND" -> new ApiException(HttpStatus.NOT_FOUND, outcome,
                    "요청한 리소스를 찾을 수 없습니다.", List.of());
            case "INVALID_STATE", "VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT" ->
                    new ApiException(HttpStatus.CONFLICT, outcome,
                            "현재 상태나 요청 내용을 확인해 주세요.", List.of());
            case "INVALID_INPUT" -> new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SURVEY",
                    "입력 내용을 확인해 주세요.", List.of());
            default -> saveFailed();
        };
    }

    private record UpdateCommand(UUID pSubmissionId, Long pExpectedVersion,
                                 SurveySubmissionRequest.Answers pAnswers, UUID pIdempotencyKey) {
    }

    private record UpdateResult(String outcome, SurveySubmissionDetailResponse submission) {
    }

    private ApiException readFailed() {
        return new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", List.of());
    }

    private ApiException saveFailed() {
        return new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "SAVE_FAILED",
                "사전조사를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", List.of());
    }

    private record InsertRequest(UUID userId, SurveySubmissionRequest.Answers answers,
                                 String generationRequestStatus) {
    }
}
