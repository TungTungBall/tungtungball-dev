package tungtungball.healthmithbackend.service;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import reactor.core.publisher.Mono;
import tungtungball.healthmithbackend.repository.GenerationWorkerStore;
import tungtungball.healthmithbackend.client.GeminiGenerationClient;
import tungtungball.healthmithbackend.config.GenerationWorkerProperties;
import org.mockito.ArgumentCaptor;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
class CycleWorkerTest {
 final JsonMapper m=JsonMapper.builder().build();
 @Test void validatesModelPlanAndKeepsSensitiveTextOut(){run(false);}
 @Test void wrongRepetitionNeverPublishes(){run(true);}
 void run(boolean invalid){
  var db=mock(GenerationWorkerStore.class);var gemini=mock(GeminiGenerationClient.class);when(db.directDatabase()).thenReturn(true);
  var job=m.readTree("{\"request_id\":\"id\",\"lease_token\":\"lease\",\"goal\":\"habit\",\"plan\":{\"exercise_id\":\"push_up_knee\",\"reps\":3,\"reason\":\"손목 통증 SECRET\"},\"keywords\":[\"more_rest\"],\"comment\":\"SECRET\",\"user_id\":\"SECRET\"}");
  when(db.execute(anyString(),any(),any())).thenAnswer(a->Mono.just(switch(a.getArgument(0,String.class)){case "poll"->m.nullNode();case "cycle_poll"->job;default->m.valueToTree(true);}));
  var out=m.createObjectNode().put("explanation","habit");var stages=out.putArray("stages");for(int i=1;i<=5;i++)stages.addObject().put("stage_index",i).put("exercise_id","push_up_knee").put("reps",invalid?99:3);
  when(gemini.generate(any(),any(),anyString())).thenReturn(Mono.just(out));
  var props=new GenerationWorkerProperties(false,null,null,null,null,null,java.time.Duration.ofMinutes(5),null,null);
  new GenerationWorkerService(db,gemini,props,m).tick().block();
  var input=ArgumentCaptor.forClass(JsonNode.class);verify(gemini).generate(input.capture(),any(),anyString());assertFalse(input.getValue().toString().contains("SECRET"));assertFalse(input.getValue().has("comment"));assertFalse(input.getValue().has("user_id"));
  verify(db).execute(eq(invalid?"cycle_fail":"cycle_publish"),any(),any());verify(db,never()).execute(eq(invalid?"cycle_publish":"cycle_fail"),any(),any());
 }
}
