package tungtungball.healthmithbackend.config;

import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBufferLimitException;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequestDecorator;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.client.CombatClient;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.config.error.ApiErrorResponse;
import tungtungball.healthmithbackend.dto.CombatRequest;
import tungtungball.healthmithbackend.dto.CombatResponse;
import tungtungball.healthmithbackend.service.CombatService;
import java.util.List;
import java.util.regex.Pattern;

/** 원시 전송 본문을 경기의 고정 한도로 제한한다. chunked/공백 입력도 같은 제한을 받는다. */
@Component
public class CombatBodyLimitFilter implements WebFilter, Ordered {
    private static final Pattern CAST_PATH=Pattern.compile("^/api/battles/([^/]+)/casts$");
    private final CombatService service;
    private final JsonMapper mapper;
    public CombatBodyLimitFilter(CombatService service,JsonMapper mapper) { this.service=service;this.mapper=mapper; }
    @Override public int getOrder() { return 0; }
    @Override public Mono<Void> filter(ServerWebExchange exchange,WebFilterChain chain) {
        var path=CAST_PATH.matcher(exchange.getRequest().getPath().value());
        if (exchange.getRequest().getMethod()!=HttpMethod.POST || !path.matches()) { return chain.filter(exchange); }
        String id=path.group(1);
        return exchange.getPrincipal().switchIfEmpty(Mono.error(CombatClient.error("UNAUTHORIZED"))).flatMap(principal -> {
            if (!(principal instanceof Authentication auth) || !(auth.getPrincipal() instanceof Jwt jwt)) { return Mono.error(CombatClient.error("UNAUTHORIZED")); }
            return service.query("drawing_limits",id,new CombatRequest.Empty(),jwt,CombatResponse.DrawingLimits.class).flatMap(limits -> {
                Integer limit=limits.maxBodyBytes();
                if (limit==null || limit<1) { return Mono.error(CombatClient.error("INTERNAL_ERROR")); }
                if (exchange.getRequest().getHeaders().getContentLength()>limit) { return Mono.error(CombatClient.error("INVALID_INPUT")); }
                return DataBufferUtils.join(exchange.getRequest().getBody(),limit).switchIfEmpty(Mono.fromSupplier(() -> exchange.getResponse().bufferFactory().wrap(new byte[0])))
                    .flatMap(buffer -> {
                        byte[] bytes=new byte[buffer.readableByteCount()];buffer.read(bytes);DataBufferUtils.release(buffer);
                        var request=new ServerHttpRequestDecorator(exchange.getRequest()) {
                            @Override public Flux<org.springframework.core.io.buffer.DataBuffer> getBody() {
                                return Flux.defer(() -> Flux.just(exchange.getResponse().bufferFactory().wrap(bytes)));
                            }
                        };
                        return chain.filter(exchange.mutate().request(request).build());
                    });
            });
        }).onErrorResume(error -> {
            ApiException api=error instanceof ApiException known ? known : error instanceof DataBufferLimitException ? CombatClient.error("INVALID_INPUT") : CombatClient.error("INTERNAL_ERROR");
            if (exchange.getResponse().isCommitted()) { return Mono.error(error); }
            exchange.getResponse().setStatusCode(api.getStatus());exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
            byte[] bytes=mapper.writeValueAsBytes(new ApiErrorResponse(api.getCode(),api.getMessage(),List.of()));
            return exchange.getResponse().writeWith(Mono.just(exchange.getResponse().bufferFactory().wrap(bytes)));
        });
    }
}
