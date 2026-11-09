package tungtungball.healthmithbackend.client;

import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.config.GenerationWorkerProperties;
import tungtungball.healthmithbackend.config.SupabaseProperties;
import java.util.UUID;

@Component
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="app.persistence.mode", havingValue="postgrest")
public class GenerationWorkerClient implements tungtungball.healthmithbackend.repository.GenerationWorkerStore {
    private final GenerationWorkerProperties properties;
    private final SupabaseProperties supabase;
    private final JsonMapper mapper;
    public GenerationWorkerClient(GenerationWorkerProperties properties,SupabaseProperties supabase,JsonMapper mapper) {
        this.properties=properties;this.supabase=supabase;this.mapper=mapper;
    }
    public Mono<JsonNode> execute(String operation,UUID worker,Object payload) {
        return Mono.defer(() -> {
            var body=mapper.createObjectNode();body.put("p_operation",operation);body.put("p_worker_id",worker.toString());body.put("p_seconds",properties.leaseSeconds());body.set("p_payload",mapper.valueToTree(payload));
            return WebClient.builder().baseUrl(supabase.url()+"/rest/v1").build().post().uri("/rpc/generation_worker")
                    .header("apikey",properties.serviceKey()).header("Authorization","Bearer "+properties.serviceKey())
                    .bodyValue(body).retrieve().bodyToMono(JsonNode.class).timeout(properties.requestTimeout());
        });
    }
}
