package tungtungball.healthmithbackend.repository;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.NimbusReactiveJwtDecoder;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;
import org.springframework.test.context.bean.override.convention.TestBean;
import org.springframework.test.web.reactive.server.WebTestClient;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.config.SupabaseJwtConfig;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** 실제 HTTP → RSA 서명 검증 → R2DBC → PostgreSQL 경로. 외부 Supabase/JWKS 호출은 포함하지 않는다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class R2dbcJwtHttpIntegrationTest extends PostgresIntegrationSupport {
    private static final String ISSUER = "https://test-project.supabase.co/auth/v1";
    private static final String A = "20000000-0000-4000-8000-000000000001";
    private static final String B = "20000000-0000-4000-8000-000000000002";
    private static final KeyPair TRUSTED = keyPair();
    private static final KeyPair FOREIGN = keyPair();
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final tools.jackson.databind.JsonNode ANSWERS = JSON.readTree("""
            {"physical_limitations":{"present":false,"body_parts":[]},"purpose":{"type":"체력","custom_text":null},
             "intensity":5,"priority_body_parts":["하체","상체"]}
            """);

    @LocalServerPort int port;
    @TestBean(methodName = "signedTokenDecoder") ReactiveJwtDecoder jwtDecoder;
    private WebTestClient http;

    static ReactiveJwtDecoder signedTokenDecoder() {
        var decoder = NimbusReactiveJwtDecoder.withPublicKey((RSAPublicKey) TRUSTED.getPublic()).build();
        decoder.setJwtValidator(SupabaseJwtConfig.tokenValidator(ISSUER));
        return decoder;
    }

    @BeforeEach
    void connect() {
        http = WebTestClient.bindToServer().baseUrl("http://127.0.0.1:" + port)
                .responseTimeout(Duration.ofSeconds(10)).build();
    }

    @Test
    void signedOwnerCanSaveReadAndUpdateButAnotherSignedUserCannot() {
        String tokenA = token(TRUSTED, A, Instant.now().plusSeconds(600));
        String tokenB = token(TRUSTED, B, Instant.now().plusSeconds(600));
        String saved = request(HttpMethod.POST, "/api/survey-submissions", tokenA,
                Map.of("answers", ANSWERS), null).expectStatus().isCreated()
                .expectBody(String.class).returnResult().getResponseBody();
        String id = JSON.readTree(saved).path("id").asString();
        String path = "/api/survey-submissions/" + id;
        request(HttpMethod.GET, path, tokenA, null, null).expectStatus().isOk()
                .expectBody().jsonPath("$.version").isEqualTo(1);
        request(HttpMethod.GET, path, tokenB, null, null).expectStatus().isNotFound();
        request(HttpMethod.PATCH, path, tokenB, Map.of("answers", ANSWERS, "expected_version", 1), UUID.randomUUID().toString())
                .expectStatus().isNotFound();
        request(HttpMethod.PATCH, path, tokenA, Map.of("answers", ANSWERS, "expected_version", 1), UUID.randomUUID().toString())
                .expectStatus().isOk().expectBody().jsonPath("$.version").isEqualTo(2);
        request(HttpMethod.GET, path, tokenA, null, null).expectStatus().isOk()
                .expectBody().jsonPath("$.version").isEqualTo(2);
        assertEquals(UUID.fromString(A), ADMIN.sql("SELECT user_id FROM public.survey_submissions WHERE id=:id")
                .bind("id", UUID.fromString(id)).map((row, metadata) -> row.get("user_id", UUID.class))
                .one().block(Duration.ofSeconds(10)));
    }

    @Test
    void invalidSignaturesExpiredAndMissingTokensCannotWrite() {
        long before = rowCount();
        for (String invalid : new String[] {null, "not-a-jwt", token(FOREIGN, A, Instant.now().plusSeconds(600)),
                token(TRUSTED, A, Instant.now().minusSeconds(600))}) {
            request(HttpMethod.POST, "/api/survey-submissions", invalid, Map.of("answers", ANSWERS), null)
                    .expectStatus().isUnauthorized().expectBody().jsonPath("$.code").isEqualTo("UNAUTHORIZED");
        }
        assertEquals(before, rowCount());
    }

    @Test
    void bodyCannotOverrideTheSignedOwner() {
        long before = rowCount();
        request(HttpMethod.POST, "/api/survey-submissions", token(TRUSTED, A, Instant.now().plusSeconds(600)),
                Map.of("answers", ANSWERS, "user_id", B), null).expectStatus().isBadRequest();
        assertEquals(before, rowCount());
    }

    private WebTestClient.ResponseSpec request(HttpMethod method, String path, String token, Object body, String key) {
        var request = http.method(method).uri(path);
        if (token != null) { request.header(HttpHeaders.AUTHORIZATION, "Bearer " + token); }
        if (key != null) { request.header("Idempotency-Key", key); }
        if (body != null) { request.contentType(MediaType.APPLICATION_JSON).bodyValue(body); }
        return request.exchange();
    }

    private long rowCount() {
        return ADMIN.sql("SELECT count(*) AS n FROM public.survey_submissions")
                .map((row, metadata) -> row.get("n", Long.class)).one().block(Duration.ofSeconds(10));
    }

    private static String token(KeyPair key, String owner, Instant expiry) {
        var jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.RS256), new JWTClaimsSet.Builder()
                .issuer(ISSUER).subject(owner).audience("authenticated").claim("role", "authenticated")
                .issueTime(Date.from(Instant.now().minusSeconds(1200))).expirationTime(Date.from(expiry)).build());
        try { jwt.sign(new RSASSASigner((RSAPrivateKey) key.getPrivate())); }
        catch (Exception error) { throw new IllegalStateException(error); }
        return jwt.serialize();
    }

    private static KeyPair keyPair() {
        try {
            var generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            return generator.generateKeyPair();
        } catch (Exception error) { throw new IllegalStateException(error); }
    }
}
