package tungtungball.healthmithbackend.repository.r2dbc;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.config.CombatWorkerProperties;
import tungtungball.healthmithbackend.repository.CombatWorkerStore;

@Repository
@ConditionalOnProperty(name="app.persistence.mode", havingValue="r2dbc", matchIfMissing=true)
public class R2dbcCombatWorkerStore implements CombatWorkerStore {
    private final WorkerDatabase database;
    private final CombatWorkerProperties properties;
    public R2dbcCombatWorkerStore(WorkerDatabase database, CombatWorkerProperties properties) {
        this.database = database; this.properties = properties;
        if (properties.enabled() && !database.configured()) { throw new IllegalStateException("전투 worker DB 설정이 필요합니다."); }
    }
    public boolean directDatabase() { return true; }
    public Mono<Void> tick() { return database.combatTick().timeout(properties.requestTimeout()); }
}
