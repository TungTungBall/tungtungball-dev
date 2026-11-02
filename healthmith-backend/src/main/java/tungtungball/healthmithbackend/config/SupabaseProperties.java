package tungtungball.healthmithbackend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Supabase Data API 연결 설정. 값은 application.properties의 자리표시자를 거쳐 환경변수로만 넣는다.
 *
 * @param url             Supabase 프로젝트 주소 (환경변수 SUPABASE_URL)
 * @param publishableKey  Data API의 apikey 헤더에 쓰는 publishable key (환경변수 SUPABASE_PUBLISHABLE_KEY)
 * @param responseTimeout Data API 응답을 기다리는 최대 시간
 */
@ConfigurationProperties(prefix = "supabase")
public record SupabaseProperties(String url, String publishableKey, Duration responseTimeout) {
}
