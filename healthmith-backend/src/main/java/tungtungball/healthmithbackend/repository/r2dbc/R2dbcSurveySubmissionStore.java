package tungtungball.healthmithbackend.repository.r2dbc;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Mono;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.dto.*;
import tungtungball.healthmithbackend.repository.SurveySubmissionStore;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Repository
@ConditionalOnProperty(name="app.persistence.mode", havingValue="r2dbc", matchIfMissing=true)
public class R2dbcSurveySubmissionStore implements SurveySubmissionStore {
    private final SurveySubmissionRepository repository;
    private final UserDatabase database;
    private final JsonMapper mapper;

    public R2dbcSurveySubmissionStore(SurveySubmissionRepository repository, UserDatabase database, JsonMapper mapper) {
        this.repository = repository;
        this.database = database;
        this.mapper = mapper;
    }

    public Mono<SurveySubmissionResponse> insert(UUID owner, String token, SurveySubmissionRequest.Answers answers) {
        return database.withUser(() -> repository.insertSubmission(owner, mapper.writeValueAsString(answers))
                .map(row -> new SurveySubmissionResponse(row.id(), answers(row), row.generationRequestStatus(), row.createdAt())))
                .onErrorMap(error -> error instanceof ApiException ? error : failure("SAVE_FAILED"));
    }

    public Mono<SurveySubmissionDetailResponse> find(UUID id, UUID owner, String token) {
        return database.withUser(() -> repository.findByIdAndUserId(id, owner).map(this::detail)
                .switchIfEmpty(Mono.error(failure("RESOURCE_NOT_FOUND"))))
                .onErrorMap(error -> error instanceof ApiException ? error : failure("INTERNAL_ERROR"));
    }

    public Mono<SurveySubmissionDetailResponse> update(UUID id, UUID key, SurveySubmissionUpdateRequest request, String token) {
        return database.withUser(() -> database.function("SELECT public.update_survey_submission(:id, :version, "
                        + "CAST(:answers AS jsonb), :key)::text AS result",
                Map.of("id", id, "version", request.expectedVersion(), "answers", mapper.writeValueAsString(request.answers()), "key", key))
                .flatMap(json -> {
                    var result = mapper.readTree(json);
                    String outcome = result.path("outcome").asString();
                    return "UPDATED".equals(outcome)
                            ? Mono.just(mapper.treeToValue(result.get("submission"), SurveySubmissionDetailResponse.class))
                            : Mono.error(failure(outcome));
                })).onErrorMap(error -> error instanceof ApiException ? error : failure("SAVE_FAILED"));
    }

    private SurveySubmissionRequest.Answers answers(SurveySubmissionEntity row) {
        return mapper.readValue(row.answers().asString(), SurveySubmissionRequest.Answers.class);
    }

    private SurveySubmissionDetailResponse detail(SurveySubmissionEntity row) {
        return new SurveySubmissionDetailResponse(row.id(), answers(row), row.generationRequestStatus(), row.createdAt(), row.version());
    }

    private ApiException failure(String code) {
        HttpStatus status = switch (code) {
            case "UNAUTHORIZED" -> HttpStatus.UNAUTHORIZED;
            case "RESOURCE_NOT_FOUND" -> HttpStatus.NOT_FOUND;
            case "VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT", "INVALID_STATE" -> HttpStatus.CONFLICT;
            case "INVALID_INPUT" -> HttpStatus.BAD_REQUEST;
            default -> HttpStatus.INTERNAL_SERVER_ERROR;
        };
        return new ApiException(status, "INVALID_INPUT".equals(code) ? "INVALID_SURVEY" : code,
                "요청 상태와 입력을 확인해 주세요.", List.of());
    }
}
