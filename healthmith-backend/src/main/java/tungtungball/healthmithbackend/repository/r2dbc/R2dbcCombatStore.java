package tungtungball.healthmithbackend.repository.r2dbc;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JavaType;
import tungtungball.healthmithbackend.client.CombatClient;
import tungtungball.healthmithbackend.repository.CombatStore;
import java.util.UUID;

@Repository
@ConditionalOnProperty(name="app.persistence.mode", havingValue="r2dbc", matchIfMissing=true)
public class R2dbcCombatStore implements CombatStore {
    private final DatabaseCommands commands;
    public R2dbcCombatStore(DatabaseCommands commands) { this.commands = commands; }
    public <T> Mono<T> command(String operation, UUID id, UUID key, Object payload, String token, JavaType type) {
        return commands.envelope("combat_command", new Command(operation, id, key, payload), type, CombatClient::error);
    }
    public <T> Mono<T> query(String operation, UUID id, Object payload, String token, JavaType type) {
        return commands.envelope("combat_query", new Query(operation, id, payload), type, CombatClient::error);
    }
    private record Command(String pOperation, UUID pResourceId, UUID pKey, Object pPayload) { }
    private record Query(String pOperation, UUID pResourceId, Object pPayload) { }
}
