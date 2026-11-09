package tungtungball.healthmithbackend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.worker-database")
public record WorkerDatabaseProperties(String url, String username, String password) {
    public boolean configured() {
        return url != null && !url.isBlank() && username != null && !username.isBlank()
                && password != null && !password.isBlank();
    }
    @Override public String toString() { return "WorkerDatabaseProperties[credentials=redacted]"; }
}
