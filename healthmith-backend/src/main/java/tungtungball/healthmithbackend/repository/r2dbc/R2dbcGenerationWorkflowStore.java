package tungtungball.healthmithbackend.repository.r2dbc;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JavaType;
import tungtungball.healthmithbackend.client.GenerationWorkflowClient;
import tungtungball.healthmithbackend.repository.GenerationWorkflowStore;
import java.util.UUID;

@Repository
@ConditionalOnProperty(name="app.persistence.mode", havingValue="r2dbc", matchIfMissing=true)
public class R2dbcGenerationWorkflowStore implements GenerationWorkflowStore {
    private final DatabaseCommands commands;
    public R2dbcGenerationWorkflowStore(DatabaseCommands commands) { this.commands = commands; }
    public <T> Mono<T> execute(String operation, UUID id, UUID key, Object payload, String token, JavaType type) {
        return commands.envelope("generation_workflow", new Command(operation, id, key, payload), type, GenerationWorkflowClient::error);
    }
    private record Command(String pOperation, UUID pResourceId, UUID pKey, Object pPayload) { }
}
