package tungtungball.healthmithbackend.repository.r2dbc;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Mono;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.client.GenerationClient;
import tungtungball.healthmithbackend.client.GenerationWorkflowClient;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.dto.*;
import tungtungball.healthmithbackend.repository.GenerationStore;
import java.util.UUID;

@Repository
@ConditionalOnProperty(name="app.persistence.mode", havingValue="r2dbc", matchIfMissing=true)
public class R2dbcGenerationStore implements GenerationStore {
    private final UserDatabase database;
    private final DatabaseCommands commands;
    private final JsonMapper mapper;
    public R2dbcGenerationStore(UserDatabase database, DatabaseCommands commands, JsonMapper mapper) {
        this.database = database; this.commands = commands; this.mapper = mapper;
    }
    public Mono<ExerciseListResponse> exercises(String token) {
        return database.withUser(() -> database.client().sql("SELECT " + DatabaseCommands.projection("id,name,body_parts,internal_focus_instruction")
                        + " AS result FROM public.exercise_catalog t WHERE enabled ORDER BY id")
                .map((row, metadata) -> mapper.readValue(row.get("result", String.class), ExerciseListResponse.Exercise.class))
                .all().collectList().map(ExerciseListResponse::new))
                .onErrorMap(error -> error instanceof ApiException ? error : GenerationClient.readFailed());
    }
    public Mono<GenerationRequestResponse> create(UUID submission, UUID key, String token) {
        return commands.call("create_initial_generation", new Create(submission, key)).flatMap(result -> {
            if ("ACCEPTED".equals(result.path("outcome").asString())) {
                return Mono.just(mapper.treeToValue(result.get("request"), GenerationRequestResponse.class));
            }
            return Mono.error(GenerationWorkflowClient.error(result.path("outcome").asString()));
        }).onErrorMap(error -> error instanceof ApiException ? error : GenerationClient.unavailable());
    }
    public Mono<GenerationRequestResponse> request(UUID id, UUID owner, String token) {
        return read("curriculum_generation_requests", "id,kind,status,curriculum_id,error,created_at,updated_at", "", id, owner, GenerationRequestResponse.class);
    }
    public Mono<CurriculumResponse> curriculum(UUID id, UUID owner, String token) {
        return read("curricula", "id,survey_submission_id,previous_curriculum_id,status,version,stages,created_at,confirmed_at", " AND validated", id, owner, CurriculumResponse.class);
    }
    private <T> Mono<T> read(String table, String fields, String condition, UUID id, UUID owner, Class<T> type) {
        return database.withUser(() -> database.client().sql("SELECT " + DatabaseCommands.projection(fields)
                        + " AS result FROM public." + table + " t WHERE id=:id AND user_id=:owner" + condition)
                .bind("id", id).bind("owner", owner)
                .map((row, metadata) -> mapper.readValue(row.get("result", String.class), type)).one()
                .switchIfEmpty(Mono.error(GenerationWorkflowClient.error("RESOURCE_NOT_FOUND"))))
                .onErrorMap(error -> error instanceof ApiException ? error : GenerationClient.readFailed());
    }
    private record Create(UUID pSubmissionId, UUID pIdempotencyKey) { }
}
