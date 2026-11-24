package tungtungball.healthmithbackend.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tungtungball.healthmithbackend.config.error.ApiException;
import tungtungball.healthmithbackend.config.error.ApiFieldError;
import tungtungball.healthmithbackend.dto.SurveyV2;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Component
public class SurveyV2Validation {
    private static final Set<String> PARTS = Set.of("neck", "shoulder", "elbow", "wrist", "lower_back", "hip", "knee", "ankle");
    public void validate(SurveyV2.Answers a) {
        require(Set.of("fitness", "strength", "weight_management", "habit").contains(a.goal()), "goal");
        require(Set.of("beginner", "occasional", "regular").contains(a.experience()), "experience");
        require(Set.of(10, 20, 30, 45, 60).contains(a.availableMinutes()), "available_minutes");
        require(a.daysPerWeek() >= 1 && a.daysPerWeek() <= 7, "days_per_week");
        require(a.limitationsPresent() != a.limitations().isEmpty(), "limitations");
        var seen = new HashSet<String>();
        for (var item : a.limitations()) {
            require(PARTS.contains(item.part()) && seen.add(item.part()), "limitations");
            var sides = Set.of("neck", "lower_back").contains(item.part()) ? Set.of("center") : Set.of("left", "right", "both");
            require(sides.contains(item.side()) && Set.of("mild", "moderate", "severe").contains(item.severity()), "limitations");
        }
        require(a.priorityBodyParts().stream().allMatch(Set.of("arms", "legs", "core", "shoulder", "chest", "neck")::contains)
                && new HashSet<>(a.priorityBodyParts()).size() == a.priorityBodyParts().size(), "priority_body_parts");
        // 중복 선택은 보존한다. 생성 후보에서 제한을 우선하는 정책은 생성 v2 연결 때 적용한다.
    }
    private void require(boolean condition, String field) {
        if (!condition) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SURVEY", "입력 내용을 확인해 주세요.",
                List.of(new ApiFieldError("answers." + field, "INVALID_INPUT", "입력 값을 확인해 주세요.")));
    }
}
