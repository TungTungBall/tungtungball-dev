package tungtungball.healthmithbackend.service;

import jakarta.annotation.PreDestroy;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import reactor.core.Disposable;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.client.GenerationWorkerClient;
import tungtungball.healthmithbackend.client.GeminiGenerationClient;
import tungtungball.healthmithbackend.config.GenerationWorkerProperties;
import java.time.Instant;
import java.util.UUID;

@Service
public class GenerationWorkerService {
    private final GenerationWorkerClient database;
    private final GeminiGenerationClient gemini;
    private final GenerationWorkerProperties properties;
    private final JsonMapper mapper;
    private final UUID workerId=UUID.randomUUID();
    private Disposable loop;
    public GenerationWorkerService(GenerationWorkerClient database,GeminiGenerationClient gemini,GenerationWorkerProperties properties,JsonMapper mapper) {
        this.database=database;this.gemini=gemini;this.properties=properties;this.mapper=mapper;
    }
    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        properties.validateEnabled();
        if (properties.enabled()) { loop=Flux.interval(properties.pollInterval()).onBackpressureDrop().concatMap(t -> tick().onErrorResume(error -> Mono.empty())).subscribe(); }
    }
    public Mono<Void> tick() {
        return database.execute("expire",workerId,new Expiry(Instant.now().minus(properties.queuedTimeout())))
                .then(database.execute("poll",workerId,new Empty())).flatMap(job -> {
                    if (job==null || job.isNull()) { return Mono.empty(); }
                    String kind=job.path("kind").asText();boolean summary="summary".equals(kind);
                    JsonNode policy=job.path("policy");JsonNode safe;
                    try { safe=safeInput(job); }
                    catch (RuntimeException error) { return fail(job,"INVALID_GENERATED_CURRICULUM"); }
                    return gemini.generate(safe,policy.get(summary ? "summary_schema" : "curriculum_schema"),policy.path(summary ? "summary_instruction" : "curriculum_instruction").asText())
                        .flatMap(output -> {
                            var payload=mapper.createObjectNode();payload.set("request_id",job.get("request_id"));payload.set("lease_token",job.get("lease_token"));
                            if (summary) {
                                if (output.size()!=1 || !output.path("summary").isString()) { return Mono.error(new IllegalArgumentException("잘못된 요약")); }
                                payload.set("summary",output.get("summary"));
                            } else {
                                if (output.size()!=1 || !output.path("stages").isArray()) { return Mono.error(new IllegalArgumentException("잘못된 커리큘럼")); }
                                payload.set("stages",output.get("stages"));
                            }
                            return database.execute(summary ? "publish_summary" : "publish_curriculum",workerId,payload)
                                    .flatMap(accepted -> accepted.asBoolean(false) ? Mono.empty() : fail(job,"INVALID_GENERATED_CURRICULUM"));
                        }).onErrorResume(error -> fail(job,error instanceof IllegalArgumentException ? "INVALID_GENERATED_CURRICULUM" : "LLM_UNAVAILABLE"));
                }).then();
    }
    /** 금지된 건강·식별자·자유 텍스트를 전송 객체에 복사하지 않는다. */
    public JsonNode safeInput(JsonNode job) {
        var result=mapper.createObjectNode();var snapshot=job.path("snapshot");
        if ("summary".equals(job.path("kind").asText())) {
            var feedback=result.putArray("feedback");
            if (!snapshot.isArray()) { throw new IllegalArgumentException("잘못된 요약 스냅샷"); }
            for (var item:snapshot) {
                int difficulty=item.path("difficulty").asInt(0),enjoyment=item.path("enjoyment").asInt(0);
                if (difficulty<1 || difficulty>5 || enjoyment<1 || enjoyment>5) { throw new IllegalArgumentException("잘못된 설문 수치"); }
                feedback.addObject().put("difficulty",difficulty).put("enjoyment",enjoyment);
            }
        } else {
            JsonNode purpose=job.path("policy").path("purpose_mapping").get(snapshot.path("purpose").path("type").asText());
            if (purpose==null || !purpose.isString()) { throw new IllegalArgumentException("목적 정제 정책 미설정"); }
            result.set("purpose",purpose);result.set("intensity",snapshot.path("intensity"));result.set("priority_body_parts",snapshot.path("priority_body_parts"));
            var candidates=result.putArray("exercises");
            for (var item:job.path("candidates")) {
                var row=candidates.addObject();for (String key:new String[]{"id","name","internal_focus_instruction"}) { row.set(key,item.path(key)); }
            }
            if (snapshot.has("difficulty")) { result.set("difficulty",snapshot.get("difficulty"));result.set("enjoyment",snapshot.get("enjoyment")); }
            // 이전 입력·요약의 원문은 외부 전송 승인 전 포함하지 않는다.
            result.set("repetition_limits",job.path("policy").path("repetition_limits"));result.set("pace_instructions",job.path("policy").path("pace_instructions"));
        }
        return result;
    }
    private Mono<Void> fail(JsonNode job,String code) {
        var payload=mapper.createObjectNode();payload.set("request_id",job.get("request_id"));payload.set("lease_token",job.get("lease_token"));payload.set("kind",job.get("kind"));payload.put("code",code);
        return database.execute("fail",workerId,payload).then();
    }
    @PreDestroy public void stop() { if (loop!=null) { loop.dispose(); } }
    private record Empty() { }
    private record Expiry(Instant queuedBefore) { }
}
