package tungtungball.healthmithbackend.service;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;
import tungtungball.healthmithbackend.dto.SurveySubmissionRequest.Answers;
import static org.junit.jupiter.api.Assertions.*;

class PainSurveyContractTest {
    private final JsonMapper mapper = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();
    private static final String LEGACY = """
            {"physical_limitations":{"present":false,"body_parts":[]},"purpose":{"type":"체력","custom_text":null},"intensity":5,"priority_body_parts":["하체"]}
            """;
    // 필수 필드 누락 차단을 전역에서 풀지 않고 새 항목만 선택적으로 받는다.
    @Test void legacyAndNewAnswersBothRoundTripWithStrictMissingPropertyChecks() {
        // 중첩 record는 실제 앱의 SNAKE_CASE 명명 정책을 사용한다.
        var configured = mapper.rebuild().propertyNamingStrategy(tools.jackson.databind.PropertyNamingStrategies.SNAKE_CASE).build();
        var legacy = configured.readValue(LEGACY, Answers.class);
        assertNull(legacy.painBodyParts());
        assertFalse(configured.writeValueAsString(legacy).contains("pain_body_parts"));
        var withPain = configured.readValue(LEGACY.stripTrailing().replace("\"intensity\":5", "\"pain_body_parts\":[\"무릎 앞쪽\"],\"intensity\":5"), Answers.class);
        assertEquals(java.util.List.of("무릎 앞쪽"), withPain.painBodyParts());
        assertEquals(withPain, configured.readValue(configured.writeValueAsString(withPain), Answers.class));
        new SurveyValidationService().validate(withPain);
        assertThrows(RuntimeException.class, () -> configured.readValue(LEGACY.replace("\"intensity\":5,", ""), Answers.class));
        assertThrows(RuntimeException.class, () -> configured.readValue(LEGACY.replace("\"intensity\":5", "\"unexpected\":true,\"intensity\":5"), Answers.class));
    }
}
