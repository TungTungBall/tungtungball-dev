package tungtungball.healthmithbackend.service;

import org.springframework.stereotype.Service;
import org.springframework.security.oauth2.jwt.Jwt;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JavaType;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.client.JourneyClient;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.config.error.ApiFieldError;
import tungtungball.healthmithbackend.dto.CurriculumResponse;
import tungtungball.healthmithbackend.dto.WorkoutSessionResponse;
import tungtungball.healthmithbackend.dto.JourneyRequest;
import tungtungball.healthmithbackend.dto.JourneyResponse;
import org.springframework.http.HttpStatus;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class JourneyService {
    private final JourneyClient client;
    private final JsonMapper mapper;
    public JourneyService(JourneyClient client, JsonMapper mapper) { this.client=client;this.mapper=mapper; }
    public <T> Mono<T> command(String operation, String id, String key, Object payload, Jwt jwt, Class<T> type) {
        return Mono.defer(() -> {
            owner(jwt);
            return client.command(operation,uuid(id),uuid(key),payload,jwt.getTokenValue(),mapper.constructType(type));
        });
    }
    public Mono<WorkoutSessionResponse> start(JourneyRequest.Start request,String key,Jwt jwt) {
        return command("start",request.curriculumId(),key,new JourneyRequest.Version(request.expectedCurriculumVersion()),jwt,WorkoutSessionResponse.class);
    }
    public Mono<JourneyResponse.Repetition> repetition(String id,JourneyRequest.Repetition request,Jwt jwt) {
        return command("repetition",id,request.eventId(),new RepPayload(request.stageIndex(),request.expectedVersion()),jwt,JourneyResponse.Repetition.class);
    }
    public Mono<JourneyResponse.FeedbackSaved> feedback(String id,JourneyRequest.Feedback request,String key,Jwt jwt) {
        return Mono.defer(() -> {
            var parts=request.sorenessBodyParts();
            if (parts==null || parts.isEmpty() || parts.stream().anyMatch(p -> p==null || !Set.of("없음","상체","하체","허리","기타").contains(p))
                    || new HashSet<>(parts).size()!=parts.size() || (parts.contains("없음") && parts.size()!=1)) {
                throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_FEEDBACK","설문 입력을 확인해 주세요.",List.of(new ApiFieldError("soreness_body_parts","INVALID_INPUT","허용된 부위를 중복 없이 선택해 주세요.")));
            }
            return command("feedback",id,key,request,jwt,JourneyResponse.FeedbackSaved.class);
        });
    }
    public <T> Mono<T> query(String operation,String id,Jwt jwt,Class<T> type) {
        return Mono.defer(() -> { owner(jwt);return client.query(operation,id==null ? null : uuid(id),new Empty(),jwt.getTokenValue(),mapper.constructType(type)); });
    }
    public <T> Mono<JourneyResponse.Page<T>> page(String operation,Integer limit,String cursor,Jwt jwt,Class<T> itemType) {
        return Mono.defer(() -> {
            UUID owner=owner(jwt);int n=limit==null ? 20 : limit;
            if (n<1 || n>50) { throw JourneyClient.error("INVALID_INPUT"); }
            JourneyResponse.Cursor position=null;
            if (cursor!=null) {
                try {
                    if (cursor.length()>2048 || !cursor.matches("[A-Za-z0-9_-]+")) { throw new IllegalArgumentException(); }
                    position=mapper.readValue(Base64.getUrlDecoder().decode(cursor),JourneyResponse.Cursor.class);
                    if (position==null || !owner.equals(position.owner()) || !operation.equals(position.operation()) || position.id()==null || position.time()==null) { throw new IllegalArgumentException(); }
                } catch (RuntimeException error) { throw JourneyClient.error("INVALID_INPUT"); }
            }
            JavaType type=mapper.getTypeFactory().constructParametricType(JourneyResponse.Page.class,itemType);
            return client.<JourneyResponse.Page<T>>query(operation,null,new PagePayload(n,position),jwt.getTokenValue(),type).map(page -> {
                if (page.items()==null || page.hasMore()==null || page.items().size()>n || page.items().stream().anyMatch(v -> v==null)
                        || page.hasMore()!=(page.nextCursor()!=null)) { throw JourneyClient.error("INTERNAL_ERROR"); }
                return page;
            });
        });
    }
    private UUID owner(Jwt jwt) {
        try { return UUID.fromString(jwt.getSubject()); }
        catch (RuntimeException error) { throw JourneyClient.error("UNAUTHORIZED"); }
    }
    private UUID uuid(String value) {
        try { UUID id=UUID.fromString(value);if (!id.toString().equalsIgnoreCase(value)) { throw new IllegalArgumentException(); } return id; }
        catch (RuntimeException error) { throw JourneyClient.error("INVALID_INPUT"); }
    }
    private record Empty() { }
    private record RepPayload(Integer stageIndex,Long expectedVersion) { }
    private record PagePayload(int limit,JourneyResponse.Cursor cursor) { }
}
