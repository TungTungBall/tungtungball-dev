package tungtungball.healthmithbackend.repository;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.JsonNode;
import static org.junit.jupiter.api.Assertions.*;
class CyclePolicyTest extends PostgresIntegrationSupport {
 final JsonMapper m=JsonMapper.builder().build();
 JsonNode plan(String variant,int n,String effort,boolean lost,String reason,int achieved){
  var a=m.readTree("{\"goal\":\"habit\",\"experience\":\"beginner\",\"available_minutes\":10,\"limitations\":[]}");
  var s=m.createObjectNode().put("id","20000000-0000-4000-8000-000000000001").put("tracking_lost",lost).put("stop_reason",reason);var counts=s.putArray("counts");for(int i=0;i<5;i++)counts.add(achieved);s.putObject("feedback").put("effort",effort);
  var r=m.createObjectNode();r.putObject("snapshot").put("experience","beginner");r.putObject("plan").put("variant",variant).put("baseline_reps",n).put("reps",n);
  return m.readTree(ADMIN.sql("SELECT private.cycle_plan(CAST(:a AS jsonb),jsonb_populate_record(null::private.cycle_sessions,CAST(:s AS jsonb)),jsonb_populate_record(null::private.cycle_requests,CAST(:r AS jsonb)),'{\"condition\":\"recommended\"}')::text AS result").bind("a",a.toString()).bind("s",s.toString()).bind("r",r.toString()).map((row,meta)->row.get("result",String.class)).one().block());
 }
 @Test void kneePromotionAndStandardDemotion(){var up=plan("knee",6,"light",false,null,6);assertEquals("standard",up.path("variant").asString());assertEquals(2,up.path("reps").asInt());var down=plan("standard",2,"hard",false,null,2);assertEquals("knee",down.path("variant").asString());assertEquals(6,down.path("reps").asInt());}
 @Test void limitsAndSkippedFeedback(){assertEquals(15,plan("standard",15,"light",false,null,15).path("reps").asInt());assertEquals(1,plan("knee",1,"hard",false,null,0).path("reps").asInt());assertEquals(3,plan("knee",3,null,false,null,3).path("reps").asInt());assertEquals(2,plan("knee",3,null,false,null,1).path("reps").asInt());}
 @Test void trackingAndPainDoNotBecomeFailure(){assertEquals(3,plan("knee",3,"hard",true,null,0).path("reps").asInt());assertEquals(3,plan("knee",3,"hard",false,"pain",0).path("reps").asInt());}
}
