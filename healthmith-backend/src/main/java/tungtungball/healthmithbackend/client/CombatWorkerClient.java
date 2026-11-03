package tungtungball.healthmithbackend.client;

import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.config.CombatWorkerProperties;
import tungtungball.healthmithbackend.config.SupabaseProperties;

@Component
public class CombatWorkerClient {
    private final SupabaseProperties supabase;
    private final CombatWorkerProperties properties;
    public CombatWorkerClient(SupabaseProperties supabase,CombatWorkerProperties properties) { this.supabase=supabase;this.properties=properties; }
    public Mono<Void> tick() {
        return WebClient.builder().baseUrl(supabase.url()+"/rest/v1").build().post().uri("/rpc/combat_tick")
                .header("apikey",properties.serviceKey()).header("Authorization","Bearer "+properties.serviceKey())
                .bodyValue("{}").header("Content-Type","application/json").retrieve().toBodilessEntity().timeout(properties.requestTimeout()).then();
    }
}
