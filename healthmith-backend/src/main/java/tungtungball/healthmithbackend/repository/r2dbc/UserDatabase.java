package tungtungball.healthmithbackend.repository.r2dbc;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.transaction.reactive.TransactionalOperator;
import reactor.core.publisher.Mono;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.config.error.ApiException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

/** 검증된 SecurityContext의 소유자만 같은 연결의 transaction-local RLS 문맥에 넣는다. */
@Component
@ConditionalOnProperty(name="app.persistence.mode", havingValue="r2dbc", matchIfMissing=true)
public class UserDatabase {
    private final DatabaseClient database;
    private final TransactionalOperator transactions;
    private final JsonMapper mapper;

    public UserDatabase(DatabaseClient database, TransactionalOperator transactions, JsonMapper mapper) {
        this.database = database;
        this.transactions = transactions;
        this.mapper = mapper;
    }

    public <T> Mono<T> withUser(Supplier<Mono<T>> action) {
        return ReactiveSecurityContextHolder.getContext()
                .filter(context -> context.getAuthentication() != null && context.getAuthentication().isAuthenticated())
                .map(context -> context.getAuthentication().getPrincipal())
                .ofType(Jwt.class)
                .switchIfEmpty(Mono.error(unauthorized()))
                .flatMap(jwt -> {
                    final UUID owner;
                    try { owner = UUID.fromString(jwt.getSubject()); }
                    catch (RuntimeException error) { return Mono.error(unauthorized()); }
                    String claims = mapper.writeValueAsString(Map.of("sub", owner.toString(), "role", "authenticated"));
                    // SET LOCAL은 commit/rollback 때 해제된다. 풀의 다음 사용자에게 상태가 남지 않는다.
                    return database.sql("SET LOCAL ROLE authenticated").then()
                            .then(database.sql("SELECT set_config('request.jwt.claims', :claims, true), "
                                    + "set_config('request.jwt.claim.sub', :owner, true)")
                                    .bind("claims", claims).bind("owner", owner.toString()).fetch().rowsUpdated())
                            .then(Mono.defer(action)).as(transactions::transactional);
                });
    }

    public DatabaseClient client() { return database; }

    public Mono<String> function(String sql, Map<String, Object> bindings) {
        var query = database.sql(sql);
        for (var entry : bindings.entrySet()) {
            query = entry.getValue() == null ? query.bindNull(entry.getKey(), UUID.class)
                    : query.bind(entry.getKey(), entry.getValue());
        }
        return query.map((row, metadata) -> row.get("result", String.class)).one();
    }

    private ApiException unauthorized() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "인증 상태를 확인해 주세요.", List.of());
    }
}
