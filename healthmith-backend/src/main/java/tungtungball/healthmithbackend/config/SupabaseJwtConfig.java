package tungtungball.healthmithbackend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusReactiveJwtDecoder;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;
import org.springframework.util.StringUtils;
import reactor.core.publisher.Mono;

import java.util.Collection;

/**
 * Supabase Auth 사용자 액세스 토큰(JWT) 검증.
 * - 서명: 프로젝트의 공개키 목록(JWKS, /auth/v1/.well-known/jwks.json)으로 확인한다. ES256·RS256.
 * - 발급자(iss): {SUPABASE_URL}/auth/v1, 대상(aud): authenticated, 만료(exp)를 확인한다.
 * - SUPABASE_URL이 없으면 모든 토큰을 거절한다(401). 서버와 테스트는 그대로 뜬다.
 * 공유 비밀(HS256) 방식 프로젝트는 지원하지 않는다. Supabase 대시보드의 JWT 설정에서 비대칭 키를 쓰는지 확인한다.
 */
@Configuration
public class SupabaseJwtConfig {

    static final String AUDIENCE = "authenticated";
    private static final String AUTH_PATH = "/auth/v1";
    private static final String JWKS_PATH = AUTH_PATH + "/.well-known/jwks.json";

    @Bean
    public ReactiveJwtDecoder jwtDecoder(SupabaseProperties properties) {
        if (!StringUtils.hasText(properties.url())) {
            return token -> Mono.error(new BadJwtException("SUPABASE_URL이 설정되지 않아 토큰을 확인할 수 없습니다."));
        }
        String baseUrl = properties.url().replaceAll("/+$", "");
        NimbusReactiveJwtDecoder decoder = NimbusReactiveJwtDecoder.withJwkSetUri(baseUrl + JWKS_PATH)
                .jwsAlgorithm(SignatureAlgorithm.ES256)
                .jwsAlgorithm(SignatureAlgorithm.RS256)
                .build();
        decoder.setJwtValidator(tokenValidator(baseUrl + AUTH_PATH));
        return decoder;
    }

    /** 발급자·만료·대상(authenticated)을 함께 확인한다. 테스트에서도 같은 규칙을 쓴다. */
    public static OAuth2TokenValidator<Jwt> tokenValidator(String issuer) {
        OAuth2TokenValidator<Jwt> audience = new JwtClaimValidator<Collection<String>>(
                JwtClaimNames.AUD, aud -> aud != null && aud.contains(AUDIENCE));
        return new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer(issuer), audience);
    }
}
