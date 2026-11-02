package tungtungball.healthmithbackend.config;

import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.server.ServerAuthenticationEntryPoint;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;

/**
 * 인증이 없거나 검증에 실패한 요청에 API.md 계약의 401 본문을 돌려준다.
 * 토큰 값이나 실패 원인은 응답에 넣지 않는다.
 */
public class JsonAuthenticationEntryPoint implements ServerAuthenticationEntryPoint {

    private static final byte[] BODY = """
            {"code":"UNAUTHORIZED","message":"인증 상태를 확인해 주세요.","field_errors":[]}"""
            .getBytes(StandardCharsets.UTF_8);

    @Override
    public Mono<Void> commence(ServerWebExchange exchange, AuthenticationException ex) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.UNAUTHORIZED);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        DataBuffer buffer = response.bufferFactory().wrap(BODY);
        return response.writeWith(Mono.just(buffer));
    }
}
