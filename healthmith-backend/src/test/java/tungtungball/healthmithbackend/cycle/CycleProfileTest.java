package tungtungball.healthmithbackend.cycle;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.*;
class CycleProfileTest {
 private final JsonMapper mapper=JsonMapper.builder().build();
 @Test void insufficientDataIsNotZero(){var p=CycleProfile.calculate(mapper.createArrayNode(),3,Instant.parse("2026-11-23T12:00:00Z"),mapper);assertEquals("collecting",p.path("status").asString());assertTrue(p.path("axes").get(0).path("value").isNull());assertTrue(p.path("axes").get(2).path("value").isNull());}
 @Test void sameVariantProgressEnduranceAndWeeklyCap(){var rows=mapper.createArrayNode();for(int i=0;i<3;i++){var s=rows.addObject().put("started_at","2026-11-23T0"+i+":00:00Z").put("ended_at","2026-11-23T0"+i+":10:00Z").put("status","completed").put("tracking_lost",false).put("active_ms",60000);var counts=s.putArray("counts");for(int j=0;j<5;j++)counts.add(3+i);s.putObject("request").putObject("plan").put("reps",3+i).put("cap",15).put("variant","knee");}
 var p=CycleProfile.calculate(rows,1,Instant.parse("2026-11-23T12:00:00Z"),mapper);assertEquals("ready",p.path("status").asString());assertEquals(83,p.path("axes").get(0).path("value").asInt());assertEquals(100,p.path("axes").get(1).path("value").asInt());assertEquals(100,p.path("axes").get(3).path("value").asInt());assertTrue(p.path("axes").get(4).path("value").isNull());assertEquals(33,p.path("axes").get(5).path("value").asInt());}
}
