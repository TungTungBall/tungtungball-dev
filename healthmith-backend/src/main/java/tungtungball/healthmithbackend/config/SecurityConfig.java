package tungtungball.healthmithbackend.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.web.server.SecurityWebFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsConfigurationSource;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * API 공통 보안 설정.
 * - 상태 없는 토큰 API라 CSRF를 끈다. 끄지 않으면 POST가 403으로 막힌다.
 * - 인증 실패는 API.md 계약 형식의 401 JSON으로 응답한다.
 * - Authorization: Bearer 의 Supabase 사용자 JWT를 검증한다(SupabaseJwtConfig). /health 외 요청은 유효한 토큰이 필요하다.
 * - 컨트롤러에서는 @AuthenticationPrincipal Jwt jwt 로 받고, jwt.getSubject()가 사용자 ID다.
 */
@Configuration
@EnableConfigurationProperties(CorsProperties.class)
public class SecurityConfig {

    private static final String API_PATH_PATTERN = "/api/**";

    @Bean
    public SecurityWebFilterChain securityWebFilterChain(ServerHttpSecurity http, CorsProperties corsProperties) {
        JsonAuthenticationEntryPoint entryPoint = new JsonAuthenticationEntryPoint();
        return http
                .csrf(ServerHttpSecurity.CsrfSpec::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource(corsProperties)))
                .httpBasic(ServerHttpSecurity.HttpBasicSpec::disable)
                .formLogin(ServerHttpSecurity.FormLoginSpec::disable)
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(entryPoint))
                .oauth2ResourceServer(oauth2 -> oauth2
                        .authenticationEntryPoint(entryPoint)
                        .jwt(Customizer.withDefaults()))
                .authorizeExchange(exchange -> exchange
                        .pathMatchers(HttpMethod.OPTIONS, API_PATH_PATTERN).permitAll()
                        .pathMatchers(HttpMethod.GET, "/health").permitAll()
                        .anyExchange().authenticated())
                .build();
    }

    private CorsConfigurationSource corsConfigurationSource(CorsProperties corsProperties) {
        CorsConfiguration configuration = new CorsConfiguration();
        List<String> origins = corsProperties.allowedOrigins();
        configuration.setAllowedOrigins(origins == null ? List.of() : origins);
        configuration.setAllowedMethods(List.of("GET", "POST"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type"));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration(API_PATH_PATTERN, configuration);
        return source;
    }
}
