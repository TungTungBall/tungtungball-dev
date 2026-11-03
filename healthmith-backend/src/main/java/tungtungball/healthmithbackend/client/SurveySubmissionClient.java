package tungtungball.healthmithbackend.client;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.codec.json.JacksonJsonDecoder;
import org.springframework.http.codec.json.JacksonJsonEncoder;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.dto.SurveySubmissionRequest;
import tungtungball.healthmithbackend.dto.SurveySubmissionResponse;

import java.util.List;
import java.util.UUID;

@Component
public class SurveySubmissionClient {
    private final WebClient webClient;

    public SurveySubmissionClient(@Qualifier("supabaseWebClient") WebClient webClient, JsonMapper mapper) {
        // 공유 클라이언트의 주소·키·타임아웃은 유지하고 서버의 엄격한 snake_case mapper를 적용한다.
        this.webClient = webClient.mutate().codecs(codecs -> {
            codecs.defaultCodecs().jacksonJsonEncoder(new JacksonJsonEncoder(mapper));
            codecs.defaultCodecs().jacksonJsonDecoder(new JacksonJsonDecoder(mapper));
        }).build();
    }

    public Mono<SurveySubmissionResponse> insert(
            UUID userId, String accessToken, SurveySubmissionRequest.Answers answers) {
        // id·created_at은 DB 기본값이다. 컬럼 INSERT 권한과 RLS를 우회하지 않는다.
        return webClient.post()
                .uri("/survey_submissions?select=id,answers,generation_request_status,created_at")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .header("Prefer", "return=representation")
                .bodyValue(new InsertRequest(userId, answers, "prepared"))
                .retrieve()
                .bodyToMono(SurveySubmissionResponse[].class)
                .filter(rows -> rows.length == 1)
                .map(rows -> rows[0])
                .filter(row -> row.id() != null && row.createdAt() != null
                        && answers.equals(row.answers()) && "prepared".equals(row.generationRequestStatus()))
                .switchIfEmpty(Mono.error(saveFailed()))
                .onErrorMap(error -> saveFailed());
    }

    private ApiException saveFailed() {
        return new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "SAVE_FAILED",
                "사전조사를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", List.of());
    }

    private record InsertRequest(UUID userId, SurveySubmissionRequest.Answers answers,
                                 String generationRequestStatus) {
    }
}
