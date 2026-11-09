package tungtungball.healthmithbackend.repository;

import io.r2dbc.spi.ConnectionFactories;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

/** 실제 PostgreSQL과 제한된 로그인으로 RLS/트랜잭션을 검사한다. Supabase 호스팅 검증과 구분한다. */
public abstract class PostgresIntegrationSupport {
    protected static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine")
            .withInitScript("db/bootstrap.sql");
    protected static final DatabaseClient ADMIN;
    static {
        POSTGRES.start();
        ADMIN = DatabaseClient.create(ConnectionFactories.get("r2dbc:postgresql://" + POSTGRES.getUsername()
                + ":" + POSTGRES.getPassword() + "@" + POSTGRES.getHost() + ":" + POSTGRES.getMappedPort(5432)
                + "/" + POSTGRES.getDatabaseName()));
        try (var paths = Files.list(Path.of("../supabase/migrations"))) {
            for (Path path : paths.filter(p -> p.toString().endsWith(".sql")).sorted().toList()) {
                ADMIN.sql(Files.readString(path)).then().block(Duration.ofSeconds(30));
            }
        } catch (Exception error) { throw new ExceptionInInitializerError(error); }
    }

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("app.persistence.mode", () -> "r2dbc");
        registry.add("spring.r2dbc.url", () -> "r2dbc:postgresql://" + POSTGRES.getHost() + ":"
                + POSTGRES.getMappedPort(5432) + "/" + POSTGRES.getDatabaseName());
        registry.add("spring.r2dbc.username", () -> "healthmith_app");
        registry.add("spring.r2dbc.password", () -> "isolated-test-password");
        // 같은 행의 경합도 DB에서 검사하도록 여러 연결을 허용한다.
        registry.add("spring.r2dbc.pool.max-size", () -> "4");
        registry.add("spring.r2dbc.pool.initial-size", () -> "0");
    }
}
