package tungtungball.healthmithbackend;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.NimbusReactiveJwtDecoder;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;
import org.springframework.test.context.bean.override.convention.TestBean;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import tungtungball.healthmithbackend.config.SupabaseJwtConfig;
import tungtungball.healthmithbackend.config.SupabaseProperties;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Date;
import java.util.List;

import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.springSecurity;

/**
 * Supabase JWT 검증(이슈 #15)이 의도대로 동작하는지 확인하는 smoke 테스트.
 * 실제 Supabase 대신 테스트 안에서 만든 RSA 키로 토큰을 서명하고, 같은 검증 규칙(발급자·대상·만료)을 적용한다.
 * 실제 프로젝트의 공개키(JWKS)로 발급 토큰을 확인하는 것은 별도의 통합 확인이다.
 */
@SpringBootTest
@Import(SupabaseJwtSmokeTest.WhoAmIController.class)
class SupabaseJwtSmokeTest {

    private static final String ISSUER = "https://test-project.supabase.co/auth/v1";
    private static final String USER_ID = "20000000-0000-4000-8000-000000000001";
    private static final KeyPair TRUSTED_KEY = newRsaKeyPair();
    private static final KeyPair OTHER_KEY = newRsaKeyPair();

    @TestBean(methodName = "testJwtDecoder")
    private ReactiveJwtDecoder jwtDecoder;

    @Autowired
    private ApplicationContext context;

    private WebTestClient client;

    static ReactiveJwtDecoder testJwtDecoder() {
        NimbusReactiveJwtDecoder decoder = NimbusReactiveJwtDecoder
                .withPublicKey((RSAPublicKey) TRUSTED_KEY.getPublic())
                .build();
        decoder.setJwtValidator(SupabaseJwtConfig.tokenValidator(ISSUER));
        return decoder;
    }

    @BeforeEach
    void setUp() {
        client = WebTestClient.bindToApplicationContext(context)
                .apply(springSecurity())
                .configureClient()
                .build();
    }

    @Test
    @DisplayName("smoke: 유효한 토큰이면 통과하고 sub가 사용자 ID로 전달된다")
    void validTokenPasses() {
        callWith(token(TRUSTED_KEY, ISSUER, List.of("authenticated"), Instant.now().plusSeconds(600)))
                .expectStatus().isOk()
                .expectBody(String.class).isEqualTo(USER_ID);
    }

    @Test
    @DisplayName("smoke: 토큰이 없으면 401 계약 JSON이다")
    void missingTokenIsUnauthorized() {
        client.get().uri("/api/smoke/whoami").exchange()
                .expectStatus().isUnauthorized()
                .expectBody().jsonPath("$.code").isEqualTo("UNAUTHORIZED");
    }

    @Test
    @DisplayName("smoke: 만료된 토큰은 401 계약 JSON이다")
    void expiredTokenIsUnauthorized() {
        assertUnauthorized(token(TRUSTED_KEY, ISSUER, List.of("authenticated"), Instant.now().minusSeconds(600)));
    }

    @Test
    @DisplayName("smoke: 다른 발급자의 토큰은 401이다")
    void wrongIssuerIsUnauthorized() {
        assertUnauthorized(token(TRUSTED_KEY, "https://other-project.supabase.co/auth/v1",
                List.of("authenticated"), Instant.now().plusSeconds(600)));
    }

    @Test
    @DisplayName("smoke: 대상(aud)이 authenticated가 아니면 401이다")
    void wrongAudienceIsUnauthorized() {
        assertUnauthorized(token(TRUSTED_KEY, ISSUER, List.of("anon"), Instant.now().plusSeconds(600)));
    }

    @Test
    @DisplayName("smoke: 다른 키로 서명한(변조) 토큰은 401이다")
    void foreignSignatureIsUnauthorized() {
        assertUnauthorized(token(OTHER_KEY, ISSUER, List.of("authenticated"), Instant.now().plusSeconds(600)));
    }

    @Test
    @DisplayName("smoke: 형식이 깨진 토큰은 401이다")
    void malformedTokenIsUnauthorized() {
        assertUnauthorized("not-a-jwt");
    }

    @Test
    @DisplayName("smoke: /health는 토큰 없이 열린다")
    void healthStaysPublic() {
        client.get().uri("/health").exchange().expectStatus().isOk();
    }

    @Test
    @DisplayName("smoke: SUPABASE_URL이 없으면 모든 토큰을 거절한다")
    void missingSupabaseUrlRejectsTokens() {
        ReactiveJwtDecoder decoder = new SupabaseJwtConfig().jwtDecoder(new SupabaseProperties("", "", null));
        StepVerifier.create(decoder.decode("any-token"))
                .expectError(BadJwtException.class)
                .verify();
    }

    private WebTestClient.ResponseSpec callWith(String token) {
        return client.get().uri("/api/smoke/whoami")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .exchange();
    }

    private void assertUnauthorized(String token) {
        callWith(token)
                .expectStatus().isUnauthorized()
                .expectBody()
                .jsonPath("$.code").isEqualTo("UNAUTHORIZED")
                .jsonPath("$.field_errors").isEmpty();
    }

    private static String token(KeyPair key, String issuer, List<String> audience, Instant expiresAt) {
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .issuer(issuer)
                .subject(USER_ID)
                .audience(audience)
                .issueTime(Date.from(Instant.now().minusSeconds(1200)))
                .expirationTime(Date.from(expiresAt))
                .claim("role", "authenticated")
                .build();
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.RS256), claims);
        try {
            jwt.sign(new RSASSASigner((RSAPrivateKey) key.getPrivate()));
        } catch (JOSEException e) {
            throw new IllegalStateException(e);
        }
        return jwt.serialize();
    }

    private static KeyPair newRsaKeyPair() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            return generator.generateKeyPair();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    @RestController
    static class WhoAmIController {

        @GetMapping("/api/smoke/whoami")
        public Mono<String> whoAmI(@AuthenticationPrincipal Jwt jwt) {
            return Mono.just(jwt.getSubject());
        }
    }
}
