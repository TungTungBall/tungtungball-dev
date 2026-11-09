package tungtungball.healthmithbackend.client;

import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.config.GenerationWorkerProperties;

@Component
public class GeminiGenerationClient {
    private final GenerationWorkerProperties properties;
    private final JsonMapper mapper;
    public GeminiGenerationClient(GenerationWorkerProperties properties,JsonMapper mapper) { this.properties=properties;this.mapper=mapper; }
    public Mono<JsonNode> generate(JsonNode safeInput,JsonNode schema,String instruction) {
        return Mono.defer(() -> {
            if (schema==null || !schema.isObject() || instruction==null || instruction.isBlank()) { return Mono.error(new IllegalArgumentException("생성 정책 미설정")); }
            var body=mapper.createObjectNode();
            body.putObject("systemInstruction").putArray("parts").addObject().put("text",instruction);
            body.putArray("contents").addObject().putArray("parts").addObject().put("text",safeInput.toString());
            var config=body.putObject("generationConfig");config.put("responseMimeType","application/json");config.set("responseJsonSchema",schema);config.put("maxOutputTokens",properties.maxOutputTokens());
            return WebClient.builder().baseUrl("https://generativelanguage.googleapis.com").build().post().uri("/v1beta/models/"+properties.model()+":generateContent")
                    .header("x-goog-api-key",properties.geminiKey()).bodyValue(body).retrieve().bodyToMono(JsonNode.class).timeout(properties.requestTimeout())
                    .map(response -> {
                        var candidates=response.path("candidates");
                        if (!candidates.isArray() || candidates.size()!=1 || !"STOP".equals(candidates.get(0).path("finishReason").asText())) { throw new IllegalArgumentException("생성 결과 미완료"); }
                        var parts=candidates.get(0).path("content").path("parts");StringBuilder text=new StringBuilder();
                        for (var part:parts) { if (part.has("text") && !part.path("thought").asBoolean(false)) { text.append(part.get("text").asText()); } }
                        return mapper.readTree(text.toString());
                    });
        });
    }
}
