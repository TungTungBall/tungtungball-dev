package tungtungball.healthmithbackend.repository;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.web.reactive.server.WebTestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.*;

@SpringBootTest
class CycleIntegrationTest extends PostgresIntegrationSupport {
 @Autowired ApplicationContext context;@Autowired JsonMapper mapper;WebTestClient client;
 static final String OWNER="20000000-0000-4000-8000-000000000001";
 @BeforeEach void setup(){ADMIN.sql("TRUNCATE private.cycle_receipts,private.cycle_sessions,private.cycle_requests CASCADE").then().block();client=WebTestClient.bindToApplicationContext(context).apply(springSecurity()).configureClient().build().mutateWith(mockJwt().jwt(j->j.subject(OWNER)));}
 JsonNode call(String op,String id,JsonNode body,String key){return mapper.readTree(client.post().uri("/api/v2/cycle/"+op+(id==null?"":"?id="+id)).header("Idempotency-Key",key).bodyValue(body).exchange().expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody());}
 JsonNode call(String op,String id,JsonNode body){return call(op,id,body,UUID.randomUUID().toString());}
 JsonNode body(String s){return mapper.readTree(s);}
 String survey(String limits){String a="{\"goal\":\"habit\",\"experience\":\"beginner\",\"available_minutes\":10,\"days_per_week\":3,\"limitations_present\":"+!limits.equals("[]")+",\"limitations\":"+limits+",\"priority_body_parts\":[\"arms\"]}";return mapper.readTree(client.post().uri("/api/v2/survey-submissions").header("Idempotency-Key",UUID.randomUUID().toString()).bodyValue(body("{\"answers\":"+a+"}")).exchange().expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody()).path("id").asString();}
 JsonNode generate(String survey){return call("generate",null,body("{\"survey_id\":\""+survey+"\",\"survey_version\":1,\"condition\":\"recommended\"}"));}
 JsonNode worker(String op,JsonNode payload){String json=ADMIN.sql("SELECT public.generation_worker(:op,gen_random_uuid(),60,CAST(:p AS jsonb))::text AS result").bind("op",op).bind("p",payload.toString()).map((r,m)->r.get("result",String.class)).one().block();return mapper.readTree(json);}
 JsonNode start(String id){var job=worker("cycle_poll",body("{}"));var publish=mapper.createObjectNode().put("request_id",id).put("lease_token",job.path("lease_token").asString()).put("explanation","habit");var stages=publish.putArray("stages");for(int i=1;i<=5;i++)stages.addObject().put("stage_index",i).put("exercise_id",job.path("plan").path("exercise_id").asString()).put("reps",job.path("plan").path("reps").asInt());assertTrue(worker("cycle_publish",publish).asBoolean());return call("start",id,body("{\"confirmed\":true}"));}
 @Test void kneePainBlocksWithoutEscalatingToStandard(){var r=generate(survey("[{\"part\":\"knee\",\"side\":\"left\",\"severity\":\"mild\"}]"));assertEquals("NO_CANDIDATES",r.path("error").asString());assertEquals("failed",r.path("status").asString());}
 @Test void generationOwnershipLeaseAndStartSnapshot(){var a=survey("[]");var r=generate(a);assertEquals(3,r.path("plan").path("reps").asInt());assertEquals(15,r.path("plan").path("cap").asInt());assertEquals(1800,r.path("plan").path("max_rest_seconds").asInt());
 var other=client.mutateWith(mockJwt().jwt(j->j.subject("20000000-0000-4000-8000-000000000002")));other.get().uri("/api/v2/cycle/request?id="+r.path("id").asString()).exchange().expectStatus().isOk().expectBody(String.class).isEqualTo("null");
 assertFalse(worker("cycle_publish",body("{\"request_id\":\""+r.path("id").asString()+"\",\"lease_token\":\""+UUID.randomUUID()+"\",\"explanation\":\"habit\"}")).asBoolean());
 var s=start(r.path("id").asString());assertEquals("active",s.path("status").asString());
 client.post().uri("/api/workout-sessions").header("Idempotency-Key",UUID.randomUUID().toString()).bodyValue(body("{\"curriculum_id\":\"10000000-0000-4000-8000-000000000001\",\"expected_curriculum_version\":1}")).exchange().expectStatus().isEqualTo(409);

 }
 @Test void repetitionsAreIdempotentRestIsEnforcedAndFeedbackFeedsNextPlan(){var r=generate(survey("[]"));var s=start(r.path("id").asString());String id=s.path("id").asString();
 for(int n=0;n<15;n++){
   ADMIN.sql("UPDATE private.cycle_sessions SET last_rep_at=null WHERE id=:id").bind("id",UUID.fromString(id)).then().block();
   var b=body("{\"version\":"+s.path("version").asInt()+"}");String key=UUID.randomUUID().toString();s=call("repetition",id,b,key);assertEquals(s,call("repetition",id,b,key));
   if((n+1)%3==0&&n<14){client.post().uri("/api/v2/cycle/repetition?id="+id).header("Idempotency-Key",UUID.randomUUID().toString()).bodyValue(body("{\"version\":"+s.path("version").asInt()+"}")).exchange().expectStatus().isEqualTo(409);s=call("rest",id,body("{\"version\":"+s.path("version").asInt()+",\"seconds\":0}"));}
 }
 assertEquals("completed",s.path("status").asString());assertEquals("polished",s.path("gem").asString());
 s=call("feedback",id,body("{\"version\":"+s.path("version").asInt()+",\"skip\":false,\"effort\":\"light\",\"duration_feedback\":null,\"satisfaction\":null,\"comment\":\"이름 연락처는 저장만\",\"keywords\":[\"more_rest\"]}"));assertEquals("submitted",s.path("feedback_status").asString());
 var next=generate(r.path("plan").isObject()?survey("[]"):"");assertEquals(4,next.path("plan").path("reps").asInt());assertEquals(75,next.path("plan").path("rest_seconds").asInt());
 var job=worker("cycle_poll",body("{}"));assertFalse(job.toString().contains("연락처"));assertFalse(job.has("snapshot"));
 }
 @Test void trackingLossAndPainNeverPenalize(){var r=generate(survey("[]"));var s=start(r.path("id").asString());String id=s.path("id").asString();s=call("tracking-lost",id,body("{\"version\":1}"));assertEquals(1,s.path("stage").asInt());assertEquals(0,s.path("counts").get(0).asInt());s=call("stop",id,body("{\"version\":2,\"reason\":\"pain\"}"));assertTrue(s.path("gem").isNull());var next=generate(survey("[]"));assertEquals(3,next.path("plan").path("reps").asInt());}
 @Test void emptyFeedbackSkipsAndCannotBeEdited(){var s=start(generate(survey("[]")).path("id").asString());String id=s.path("id").asString();ADMIN.sql("UPDATE private.cycle_sessions SET status='completed',ended_at=now(),counts=ARRAY[3,3,3,3,3] WHERE id=:id").bind("id",UUID.fromString(id)).then().block();var b=body("{\"version\":1,\"skip\":false,\"effort\":null,\"duration_feedback\":null,\"satisfaction\":null,\"comment\":\"\",\"keywords\":[]}");s=call("feedback",id,b);assertEquals("skipped",s.path("feedback_status").asString());client.post().uri("/api/v2/cycle/feedback?id="+id).header("Idempotency-Key",UUID.randomUUID().toString()).bodyValue(b).exchange().expectStatus().isEqualTo(409);assertEquals("queued",generate(survey("[]")).path("status").asString());}
 @Test void restNeverExtendsPastThirtyMinutesFromStageBoundary(){var s=start(generate(survey("[]")).path("id").asString());String id=s.path("id").asString();ADMIN.sql("UPDATE private.cycle_sessions SET stage=2,rest_started_at=now()-interval '10 minutes',rest_until=now()+interval '1 minute' WHERE id=:id").bind("id",UUID.fromString(id)).then().block();s=call("rest",id,body("{\"version\":1,\"seconds\":1800}"));var start=java.time.Instant.parse(s.path("rest_started_at").asString());var until=java.time.Instant.parse(s.path("rest_until").asString());assertEquals(1800,java.time.Duration.between(start,until).toSeconds());client.post().uri("/api/v2/cycle/rest?id="+id).header("Idempotency-Key",UUID.randomUUID().toString()).bodyValue(body("{\"version\":2,\"seconds\":1801}")).exchange().expectStatus().isBadRequest();}
 @Test void workerRejectsChangedExerciseAndUnleasedResult(){var r=generate(survey("[]"));var job=worker("cycle_poll",body("{}"));var payload=mapper.createObjectNode().put("request_id",r.path("id").asString()).put("lease_token",job.path("lease_token").asString()).put("explanation","habit");var stages=payload.putArray("stages");for(int i=1;i<=5;i++)stages.addObject().put("stage_index",i).put("exercise_id","unauthorized_exercise").put("reps",3);assertFalse(worker("cycle_publish",payload).asBoolean());payload.remove("lease_token");assertFalse(worker("cycle_publish",payload).asBoolean());}

}
