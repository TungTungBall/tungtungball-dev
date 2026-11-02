package tungtungball.healthmithbackend.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.util.StringUtils;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

/**
 * Supabase Data API(/rest/v1)를 호출하는 WebClient.
 * 이 설정은 기본 주소, apikey 헤더, 응답 타임아웃만 정한다.
 * 사용자 JWT(Authorization 헤더)는 요청마다 서버 영역 코드가 붙인다 (STACK.md 3절).
 */
@Configuration
@EnableConfigurationProperties(SupabaseProperties.class)
public class SupabaseClientConfig {

    private static final String DATA_API_PATH = "/rest/v1";

    @Bean
    public WebClient supabaseWebClient(SupabaseProperties properties) {
        HttpClient httpClient = HttpClient.create();
        if (properties.responseTimeout() != null) {
            httpClient = httpClient.responseTimeout(properties.responseTimeout());
        }

        WebClient.Builder builder = WebClient.builder()
                .clientConnector(new ReactorClientHttpConnector(httpClient));
        if (StringUtils.hasText(properties.url())) {
            builder.baseUrl(properties.url().replaceAll("/+$", "") + DATA_API_PATH);
        }
        if (StringUtils.hasText(properties.publishableKey())) {
            builder.defaultHeader("apikey", properties.publishableKey());
        }
        return builder.build();
    }
}
