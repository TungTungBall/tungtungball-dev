package tungtungball.healthmithbackend.service;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.dto.SurveyV2;
import tungtungball.healthmithbackend.repository.r2dbc.UserDatabase;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.UUID;

@Service
@ConditionalOnProperty(name="app.persistence.mode", havingValue="r2dbc", matchIfMissing=true)
public class SurveyV2Service {
    private final UserDatabase db;
    private final JsonMapper mapper;
    private final SurveyV2Validation validation;
    public SurveyV2Service(UserDatabase db, JsonMapper mapper, SurveyV2Validation validation) {
        this.db = db; this.mapper = mapper; this.validation = validation;
    }
    public Mono<SurveyV2.Detail> save(String id, Long version, String key, SurveyV2.Answers answers) {
        return Mono.defer(() -> {
            validation.validate(answers);
            Map<String, Object> values = new HashMap<>();
            values.put("id", id == null ? null : uuid(id));
            values.put("version", version == null ? 0L : version);
            values.put("key", uuid(key));
            values.put("answers", mapper.writeValueAsString(answers));
            return db.withUser(() -> db.function("SELECT public.save_survey_v2(:id, :version, CAST(:answers AS jsonb), :key)::text AS result", values)
                    .flatMap(json -> {
                        var result = mapper.readTree(json);
                        return "SAVED".equals(result.path("outcome").asString())
                                ? Mono.just(mapper.treeToValue(result.get("submission"), SurveyV2.Detail.class))
                                : Mono.error(error(result.path("outcome").asString()));
                    }));
        }).onErrorMap(e -> e instanceof ApiException ? e : error("SAVE_FAILED"));
    }
    public Mono<SurveyV2.Detail> find(String id) {
        return Mono.defer(() -> {
            var parsed = uuid(id);
            return db.withUser(() -> read("WHERE id = :id AND user_id = auth.uid()", Map.of("id", parsed)));
        }).onErrorMap(e -> e instanceof ApiException ? e : error("INTERNAL_ERROR"));
    }
    public Mono<SurveyV2.Detail> latest() {
        return db.withUser(() -> read("WHERE user_id = auth.uid() ORDER BY created_at DESC, id DESC LIMIT 1", Map.of()))
                .onErrorMap(e -> e instanceof ApiException ? e : error("INTERNAL_ERROR"));
    }
    private Mono<SurveyV2.Detail> read(String condition, Map<String, Object> values) {
        return db.function("SELECT jsonb_build_object('id', id, 'schema_version', 2, 'answers', answers, "
                + "'version', version, 'created_at', created_at)::text AS result FROM public.survey_submissions_v2 " + condition, values)
                .map(json -> mapper.readValue(json, SurveyV2.Detail.class))
                .switchIfEmpty(Mono.error(error("RESOURCE_NOT_FOUND")));
    }
    private UUID uuid(String value) {
        try {
            var id = UUID.fromString(value);
            if (!id.toString().equalsIgnoreCase(value)) throw new IllegalArgumentException();
            return id;
        } catch (RuntimeException e) { throw error("INVALID_REQUEST"); }
    }
    private ApiException error(String code) {
        var status = switch (code) {
            case "UNAUTHORIZED" -> HttpStatus.UNAUTHORIZED;
            case "RESOURCE_NOT_FOUND" -> HttpStatus.NOT_FOUND;
            case "VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT" -> HttpStatus.CONFLICT;
            case "INVALID_INPUT", "INVALID_REQUEST" -> HttpStatus.BAD_REQUEST;
            default -> HttpStatus.INTERNAL_SERVER_ERROR;
        };
        return new ApiException(status, "INVALID_INPUT".equals(code) ? "INVALID_SURVEY" : code,
                "요청 상태와 입력을 확인해 주세요.", List.of());
    }
}
