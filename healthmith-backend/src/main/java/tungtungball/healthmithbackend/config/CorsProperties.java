package tungtungball.healthmithbackend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * 브라우저가 /api/** 를 직접 호출할 때 허용할 프론트엔드 출처.
 *
 * @param allowedOrigins 허용 출처 목록 (환경변수 CORS_ALLOWED_ORIGINS, 쉼표로 구분)
 */
@ConfigurationProperties(prefix = "app.cors")
public record CorsProperties(List<String> allowedOrigins) {
}
