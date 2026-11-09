package tungtungball.healthmithbackend.service;

import org.springframework.stereotype.Service;
import org.springframework.security.oauth2.jwt.Jwt;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.repository.GenerationWorkflowStore;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.client.GenerationWorkflowClient;
import tungtungball.healthmithbackend.dto.GenerationWorkflowResponse;
import java.util.UUID;

@Service
public class GenerationWorkflowService {
    private final GenerationWorkflowStore client;
    private final JsonMapper mapper;
    public GenerationWorkflowService(GenerationWorkflowStore client,JsonMapper mapper) { this.client=client;this.mapper=mapper; }
    public <T> Mono<T> execute(String operation,String id,String key,Object payload,Jwt jwt,Class<T> type) {
        return Mono.defer(() -> {
            try { UUID.fromString(jwt.getSubject()); }
            catch (RuntimeException error) { throw GenerationWorkflowClient.error("UNAUTHORIZED"); }
            return client.execute(operation,id==null ? null : uuid(id),key==null && operation.startsWith("tendency") ? null : uuid(key),payload,jwt.getTokenValue(),mapper.constructType(type));
        });
    }
    private UUID uuid(String value) {
        try { UUID id=UUID.fromString(value);if (!id.toString().equalsIgnoreCase(value)) { throw new IllegalArgumentException(); }return id; }
        catch (RuntimeException error) { throw GenerationWorkflowClient.error("INVALID_INPUT"); }
    }
}
