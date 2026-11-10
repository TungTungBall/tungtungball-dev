package tungtungball.healthmithbackend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.client.GenerationWorkerClient;
import tungtungball.healthmithbackend.client.GeminiGenerationClient;
import tungtungball.healthmithbackend.config.GenerationWorkerProperties;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GenerationWorkerServiceTest {
    private final JsonMapper mapper=JsonMapper.builder().build();
    private final GenerationWorkerClient database=mock(GenerationWorkerClient.class);
    private final GeminiGenerationClient gemini=mock(GeminiGenerationClient.class);
    private final GenerationWorkerProperties disabled=new GenerationWorkerProperties(false,null,null,null,null,null,null,null,null);
    private final GenerationWorkerService service=new GenerationWorkerService(database,gemini,disabled,mapper);
    @Test @DisplayName("US-02 (실패·거절) 기본 비활성 worker는 외부 호출을 시작하지 않는다")
    void disabled() { service.start();service.stop();verifyNoInteractions(database,gemini); }
    @Test @DisplayName("US-09 (LLM) 요약 입력에서 통증·신체 제약·사용자 식별자를 제거한다")
    void summaryWhitelist() {
        var input=mapper.readTree("{\"kind\":\"summary\",\"snapshot\":[{\"difficulty\":2,\"enjoyment\":4,\"user_id\":\"SECRET\",\"soreness_body_parts\":[\"허리\"]}]}");
        var safe=service.safeInput(input);assertEquals(2,safe.get("feedback").get(0).size());assertFalse(safe.toString().contains("SECRET"));assertFalse(safe.toString().contains("허리"));
    }
    @Test @DisplayName("US-02 (LLM) 자유 텍스트와 제약 부위를 전송 객체에 복사하지 않는다")
    void curriculumWhitelist() {
        var input=mapper.readTree("""
          {"kind":"curriculum","snapshot":{"purpose":{"type":"체력","custom_text":"SECRET"},"intensity":3,"priority_body_parts":["상체"],"physical_limitations":{"body_parts":["허리"]},"summary":"SECRET"},"candidates":[{"id":"A","name":"테스트","body_parts":["허리"],"internal_focus_instruction":"안내"}],"policy":{"purpose_mapping":{"체력":"체력"},"repetition_limits":{"A":{"min":1,"max":3}},"pace_instructions":["천천히"]}}
          """);
        var safe=service.safeInput(input);assertFalse(safe.toString().contains("SECRET"));assertFalse(safe.toString().contains("허리"));assertEquals(3,safe.get("exercises").get(0).size());
    }
    @Test @DisplayName("US-02 (실패·거절) 정제 목적 정책이 없으면 LLM 입력 생성 거절")
    void missingPurposePolicy() { assertThrows(IllegalArgumentException.class,() -> service.safeInput(mapper.readTree("{\"kind\":\"curriculum\",\"snapshot\":{},\"policy\":{}}")));verifyNoInteractions(gemini); }
    @Test @DisplayName("GenerationWorkerProperties smoke: 활성 설정 누락과 비밀 표시 차단")
    void invalidProperties() {
        var config=new GenerationWorkerProperties(true,"SECRET","GEMINI",null,null,null,null,null,null);
        assertThrows(IllegalStateException.class,config::validateEnabled);assertFalse(config.toString().contains("SECRET"));assertFalse(config.toString().contains("GEMINI"));
    }
    @Test @DisplayName("생성 worker poll 주기가 lease 이상이면 가용성 공백을 막기 위해 기동 거절")
    void pollMustBeShorterThanLease() {
        var config = new GenerationWorkerProperties(true,null,"SECRET","test-model",java.time.Duration.ofSeconds(60),java.time.Duration.ofSeconds(10),java.time.Duration.ofMinutes(5),60,1000);
        assertThrows(IllegalStateException.class, () -> config.validateEnabled(true));
        var valid = new GenerationWorkerProperties(true,null,"SECRET","test-model",java.time.Duration.ofSeconds(1),java.time.Duration.ofSeconds(10),java.time.Duration.ofMinutes(5),60,1000);
        assertDoesNotThrow(() -> valid.validateEnabled(true));
    }
    @Test @DisplayName("US-04 (LLM) 다음 생성은 이전 커리큘럼·승인된 최신 요약 문맥 전달")
    void nextContext() {
        var job=mapper.readTree("""
          {"kind":"curriculum","snapshot":{"purpose":{"type":"체력"},"intensity":2,"priority_body_parts":["상체"],"difficulty":2,"enjoyment":4,"previous_stages":[{"stage_index":1,"exercise_id":"A","target_repetitions":3,"pace_instruction":"검토된 속도","internal_focus_instruction":"등록 안내","user_id":"SECRET"}],"summary":"운동 선호 요약"},"candidates":[{"id":"A","name":"테스트","internal_focus_instruction":"등록 안내"}],"policy":{"purpose_mapping":{"체력":"체력"},"include_generated_summary":true,"adjustment_instruction":"승인된 조정 정책","repetition_limits":{"A":{"min":1,"max":3}},"pace_instructions":["검토된 속도"]}}
          """);
        var safe=service.safeInput(job);assertEquals("운동 선호 요약",safe.get("latest_successful_summary").asText());
        assertEquals(5,safe.get("previous_curriculum").get(0).size());assertFalse(safe.toString().contains("SECRET"));
    }
    @Test @DisplayName("US-04 (실패·거절) 최신 생성 요약 전송 승인이 없으면 조용히 생략하지 않는다")
    void summaryApprovalRequired() {
        var job=mapper.readTree("""
          {"kind":"curriculum","snapshot":{"purpose":{"type":"체력"},"intensity":2,"priority_body_parts":["상체"],"previous_stages":[],"summary":"이전 요약"},"candidates":[],"policy":{"purpose_mapping":{"체력":"체력"},"adjustment_instruction":"승인된 조정 정책"}}
          """);
        assertThrows(IllegalArgumentException.class,() -> service.safeInput(job));verifyNoInteractions(gemini);
    }
}
