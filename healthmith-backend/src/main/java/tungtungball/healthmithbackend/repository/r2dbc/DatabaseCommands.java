package tungtungball.healthmithbackend.repository.r2dbc;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.JavaType;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.client.GenerationWorkflowClient;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/** 허용한 함수 이름과 타입만 사용하고 입력값은 모두 바인딩한다. */
@Repository
@ConditionalOnProperty(name="app.persistence.mode", havingValue="r2dbc", matchIfMissing=true)
public class DatabaseCommands {
    private static final Map<String, String> SIGNATURES = Map.of(
            "create_initial_generation", "p_submission_id:uuid,p_idempotency_key:uuid",
            "change_workout_state", "p_session_id:uuid,p_expected_version:bigint,p_command:text,p_reason:text,p_idempotency_key:uuid",
            "journey_command", "p_operation:text,p_resource_id:uuid,p_key:uuid,p_payload:jsonb",
            "journey_query", "p_operation:text,p_resource_id:uuid,p_payload:jsonb",
            "generation_workflow", "p_operation:text,p_resource_id:uuid,p_key:uuid,p_payload:jsonb",
            "combat_command", "p_operation:text,p_resource_id:uuid,p_key:uuid,p_payload:jsonb",
            "combat_query", "p_operation:text,p_resource_id:uuid,p_payload:jsonb"
    );
    private final UserDatabase database;
    private final JsonMapper mapper;

    public DatabaseCommands(UserDatabase database, JsonMapper mapper) { this.database = database; this.mapper = mapper; }

    public Mono<JsonNode> call(String function, Object body) {
        String signature = SIGNATURES.get(function);
        if (signature == null) { return Mono.error(new IllegalArgumentException("허용하지 않은 DB 명령")); }
        JsonNode input = mapper.valueToTree(body);
        String[] arguments = signature.split(",");
        String sqlArguments = java.util.Arrays.stream(arguments).map(value -> {
            String[] pair = value.split(":");
            return pair[0] + " => CAST(:" + pair[0] + " AS " + pair[1] + ")";
        }).collect(Collectors.joining(","));
        return database.withUser(() -> {
            var query = database.client().sql("SELECT public." + function + "(" + sqlArguments + ")::text AS result");
            for (String argument : arguments) {
                String[] pair = argument.split(":");
                JsonNode value = input.get(pair[0]);
                // SQL에서 명시적으로 캐스트하므로 null도 문자열 타입으로 안전하게 바인딩한다.
                query = value == null || value.isNull() ? query.bindNull(pair[0], String.class)
                        : query.bind(pair[0], "jsonb".equals(pair[1]) ? mapper.writeValueAsString(value) : value.isString() ? value.asString() : value.toString());
            }
            return query.map((row, metadata) -> mapper.readTree(row.get("result", String.class))).one();
        });
    }

    public <T> Mono<T> envelope(String function, Object body, JavaType type,
            Function<String, ApiException> errors) {
        return call(function, body).flatMap(result -> {
            if (!"OK".equals(result.path("outcome").asString())) {
                return Mono.error(errors.apply(result.path("outcome").asString()));
            }
            JsonNode data = result.get("data");
            if (data == null || data.isNull()) { return Mono.error(errors.apply("INTERNAL_ERROR")); }
            T value = mapper.convertValue(data, type);
            return value == null ? Mono.error(errors.apply("INTERNAL_ERROR")) : Mono.just(value);
        }).onErrorMap(error -> error instanceof ApiException ? error : errors.apply("INTERNAL_ERROR"));
    }

    /** 테이블/필드는 저장소 내부 상수만 전달한다. 사용자 입력으로 SQL 식별자를 만들지 않는다. */
    public static String projection(String fields) {
        return "jsonb_build_object(" + java.util.Arrays.stream(fields.split(","))
                .map(field -> "'" + field + "', t." + field).collect(Collectors.joining(",")) + ")::text";
    }
}
