package tungtungball.healthmithbackend.cycle;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.repository.r2dbc.UserDatabase;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.service.SurveyV2Service;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api/v2/cycle")
@ConditionalOnProperty(name="app.persistence.mode",havingValue="r2dbc",matchIfMissing=true)
public class CycleController {
    private final UserDatabase db; private final JsonMapper mapper; private final SurveyV2Service surveys;
    public CycleController(UserDatabase db, JsonMapper mapper, SurveyV2Service surveys) {this.db=db;this.mapper=mapper;this.surveys=surveys;}
    @PostMapping("/{operation}")
    public Mono<JsonNode> command(@PathVariable String operation, @RequestParam(required=false) String id,
            @RequestHeader(value="Idempotency-Key",required=false) String key, @RequestBody JsonNode body) {
        return Mono.defer(() -> {
            var values=new HashMap<String,Object>();values.put("op",operation);values.put("id",id==null?null:uuid(id));values.put("key",uuid(key));values.put("body",body.toString());
            return db.withUser(() -> db.function("SELECT public.cycle_command(:op,:id,:key,CAST(:body AS jsonb))::text AS result",values)).map(mapper::readTree).map(this::checked);
        });
    }
    @GetMapping("/{operation}")
    public Mono<JsonNode> query(@PathVariable String operation,@RequestParam(required=false) String id) {
        return Mono.defer(() -> {
            var values=new HashMap<String,Object>();values.put("op",operation);values.put("id",id==null?null:uuid(id));
            return db.withUser(() -> db.function("SELECT public.cycle_query(:op,:id)::text AS result",values)).map(mapper::readTree).map(this::checked);
        });
    }
    @PostMapping("/keywords/preview")
    public JsonNode keywords(@RequestBody JsonNode body) {
        if (!body.path("comment").isString() || body.path("comment").asString().length()>500 || body.size()!=1) throw error("INVALID_INPUT");
        return mapper.valueToTree(FeedbackKeywords.extract(body.path("comment").asString()));
    }
    @GetMapping("/profile/summary")
    public Mono<JsonNode> profile() {
        return query("records",null).zipWith(surveys.latest().map(s->s.answers().daysPerWeek()).onErrorResume(ApiException.class,e -> e.getStatus()==HttpStatus.NOT_FOUND?Mono.just(3):Mono.error(e)))
            .map(pair->CycleProfile.calculate(pair.getT1(),pair.getT2(),Instant.now(),mapper));
    }
    private UUID uuid(String value) {try {var id=UUID.fromString(value);if(!id.toString().equalsIgnoreCase(value))throw new IllegalArgumentException();return id;}catch(RuntimeException e){throw error("INVALID_INPUT");}}
    private JsonNode checked(JsonNode node) {if(node.isObject()&&node.hasNonNull("error")&&!node.has("status"))throw error(node.path("error").asString());return node;}
    private ApiException error(String code) {
        return new ApiException(switch(code){case "UNAUTHORIZED"->HttpStatus.UNAUTHORIZED;case "NOT_FOUND"->HttpStatus.NOT_FOUND;case "VERSION_CONFLICT","IDEMPOTENCY_CONFLICT","ACTIVE_SESSION","GENERATION_IN_PROGRESS","INVALID_STATE","STALE_SURVEY","ALREADY_STARTED","TOO_FAST"->HttpStatus.CONFLICT;default->HttpStatus.BAD_REQUEST;},code,"요청 상태를 다시 확인해 주세요.",List.of());
    }
}
