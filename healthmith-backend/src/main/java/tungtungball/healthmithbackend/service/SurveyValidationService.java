package tungtungball.healthmithbackend.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.config.error.ApiFieldError;
import tungtungball.healthmithbackend.dto.SurveySubmissionRequest;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** S01/S03 모두 같은 사전조사 업무 검사를 적용한다. 원문·순서를 바꾸지 않는다. */
@Service
public class SurveyValidationService {
    private static final Set<String> BODY_PARTS = Set.of("상체", "하체", "허리");
    private static final Set<String> PURPOSES = Set.of("체력", "감량", "근력", "자세", "자유 입력");
    public void validate(SurveySubmissionRequest.Answers answers) {
        var purpose = answers.purpose();
        if (!PURPOSES.contains(purpose.type())) {
            throw invalid("answers.purpose.type");
        }
        if ("자유 입력".equals(purpose.type())) {
            if (purpose.customText() == null || purpose.customText().isBlank()) {
                throw invalid("answers.purpose.custom_text");
            }
        } else if (purpose.customText() != null) {
            throw invalid("answers.purpose.custom_text");
        }
        var limitations = answers.physicalLimitations();
        validateParts(limitations.bodyParts(), "answers.physical_limitations.body_parts");
        if (limitations.present() == limitations.bodyParts().isEmpty()) {
            throw invalid("answers.physical_limitations.body_parts");
        }
        validateParts(answers.priorityBodyParts(), "answers.priority_body_parts");
        if (answers.priorityBodyParts().isEmpty()) {
            throw invalid("answers.priority_body_parts");
        }
        if (answers.priorityBodyParts().stream().anyMatch(limitations.bodyParts()::contains)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SURVEY", "입력 내용을 확인해 주세요.",
                    List.of(new ApiFieldError("answers.priority_body_parts", "BODY_PART_CONFLICT",
                            "운동할 수 없는 부위가 우선 부위에 포함되어 있습니다. 우선 부위를 수정해 주세요.")));
        }
    }

    private void validateParts(List<String> parts, String field) {
        if (parts.stream().anyMatch(part -> !BODY_PARTS.contains(part))
                || new HashSet<>(parts).size() != parts.size()) {
            throw invalid(field);
        }
    }

    private ApiException invalid(String field) {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SURVEY", "입력 내용을 확인해 주세요.",
                List.of(new ApiFieldError(field, "INVALID_INPUT", "입력 값을 확인해 주세요.")));
    }
}
