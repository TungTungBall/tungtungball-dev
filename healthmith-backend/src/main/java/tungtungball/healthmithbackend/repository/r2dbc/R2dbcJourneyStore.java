package tungtungball.healthmithbackend.repository.r2dbc;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JavaType;
import tungtungball.healthmithbackend.client.JourneyClient;
import tungtungball.healthmithbackend.repository.JourneyStore;
import java.util.UUID;

@Repository
@ConditionalOnProperty(name="app.persistence.mode", havingValue="r2dbc", matchIfMissing=true)
public class R2dbcJourneyStore implements JourneyStore {
    private final DatabaseCommands commands;
    public R2dbcJourneyStore(DatabaseCommands commands) { this.commands = commands; }
    public <T> Mono<T> command(String operation, UUID id, UUID key, Object payload, String token, JavaType type) {
        return commands.envelope("journey_command", new Command(operation, id, key, payload), type, JourneyClient::error);
    }
    public <T> Mono<T> query(String operation, UUID id, Object payload, String token, JavaType type) {
        return commands.envelope("journey_query", new Query(operation, id, payload), type, JourneyClient::error);
    }
    private record Command(String pOperation, UUID pResourceId, UUID pKey, Object pPayload) { }
    private record Query(String pOperation, UUID pResourceId, Object pPayload) { }
}
