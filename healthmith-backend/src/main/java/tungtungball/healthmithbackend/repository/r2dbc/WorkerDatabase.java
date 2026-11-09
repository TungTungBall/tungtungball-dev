package tungtungball.healthmithbackend.repository.r2dbc;

import io.r2dbc.spi.ConnectionFactories;
import io.r2dbc.spi.ConnectionFactoryOptions;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.config.WorkerDatabaseProperties;
import java.util.UUID;

/** 일반 API 연결과 별도인 최소 함수 실행 권한의 worker 로그인만 사용한다. */
@Repository
@EnableConfigurationProperties(WorkerDatabaseProperties.class)
@ConditionalOnProperty(name="app.persistence.mode", havingValue="r2dbc", matchIfMissing=true)
public class WorkerDatabase {
    private final WorkerDatabaseProperties properties;
    private final JsonMapper mapper;
    private final DatabaseClient client;
    public WorkerDatabase(WorkerDatabaseProperties properties, JsonMapper mapper) {
        this.properties = properties; this.mapper = mapper;
        this.client = properties.configured() ? DatabaseClient.create(ConnectionFactories.get(
                ConnectionFactoryOptions.parse(properties.url()).mutate()
                        .option(ConnectionFactoryOptions.USER, properties.username())
                        .option(ConnectionFactoryOptions.PASSWORD, properties.password()).build())) : null;
    }
    public boolean configured() { return properties.configured(); }
    public Mono<JsonNode> generation(String operation, UUID worker, int seconds, Object payload) {
        if (client == null) { return Mono.error(new IllegalStateException("worker DB 설정이 필요합니다.")); }
        return client.sql("SELECT public.generation_worker(:operation, :worker, :seconds, CAST(:payload AS jsonb))::text AS result")
                .bind("operation", operation).bind("worker", worker).bind("seconds", seconds)
                .bind("payload", mapper.writeValueAsString(payload))
                .map((row, metadata) -> mapper.readTree(row.get("result", String.class) == null ? "null" : row.get("result", String.class))).one();
    }
}
