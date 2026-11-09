package tungtungball.healthmithbackend.repository;
import reactor.core.publisher.Mono;
public interface CombatWorkerStore {
    Mono<Void> tick();
    default boolean directDatabase() { return false; }
}
