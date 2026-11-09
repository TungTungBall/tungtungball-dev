package tungtungball.healthmithbackend.repository.r2dbc;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Mono;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.client.WorkoutClient;
import tungtungball.healthmithbackend.client.GenerationWorkflowClient;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.dto.*;
import tungtungball.healthmithbackend.repository.WorkoutStore;
import java.util.List;
import java.util.UUID;

@Repository
@ConditionalOnProperty(name="app.persistence.mode", havingValue="r2dbc", matchIfMissing=true)
public class R2dbcWorkoutStore implements WorkoutStore {
    private static final String FIELDS = "id,curriculum_id,status,current_stage_index,current_repetitions,completed_stage_count,version,stage_results,started_at,updated_at,ended_at,feedback_status";
    private final UserDatabase database;
    private final DatabaseCommands commands;
    private final JsonMapper mapper;
    public R2dbcWorkoutStore(UserDatabase database, DatabaseCommands commands, JsonMapper mapper) {
        this.database = database; this.commands = commands; this.mapper = mapper;
    }
    private Mono<List<WorkoutSessionResponse>> rows(UUID id, UUID owner) {
        return database.withUser(() -> {
            var query = database.client().sql("SELECT " + DatabaseCommands.projection(FIELDS)
                    + " AS result FROM public.workout_sessions t WHERE user_id=:owner AND "
                    + (id == null ? "status IN ('in_progress','paused')" : "id=:id") + " LIMIT 2").bind("owner", owner);
            if (id != null) { query = query.bind("id", id); }
            return query.map((row, metadata) -> mapper.readValue(row.get("result", String.class), WorkoutSessionResponse.class)).all().collectList();
        }).onErrorMap(error -> error instanceof ApiException ? error : WorkoutClient.failed());
    }
    public Mono<CurrentWorkoutResponse> current(UUID owner, String token) {
        return rows(null, owner).flatMap(rows -> rows.size() > 1 ? Mono.error(WorkoutClient.failed())
                : Mono.just(new CurrentWorkoutResponse(rows.isEmpty() ? null : rows.getFirst())));
    }
    public Mono<WorkoutSessionResponse> read(UUID id, UUID owner, String token) {
        return rows(id, owner).flatMap(rows -> rows.isEmpty() ? Mono.error(GenerationWorkflowClient.error("RESOURCE_NOT_FOUND")) : Mono.just(rows.getFirst()));
    }
    public Mono<WorkoutSessionResponse> change(UUID id, long version, String command, String reason, UUID key, String token) {
        return commands.call("change_workout_state", new Change(id, version, command, reason, key)).flatMap(result ->
                "UPDATED".equals(result.path("outcome").asString())
                        ? Mono.just(mapper.treeToValue(result.get("session"), WorkoutSessionResponse.class))
                        : Mono.error(GenerationWorkflowClient.error(result.path("outcome").asString())))
                .onErrorMap(error -> error instanceof ApiException ? error : WorkoutClient.failed());
    }
    private record Change(UUID pSessionId, long pExpectedVersion, String pCommand, String pReason, UUID pIdempotencyKey) { }
}
