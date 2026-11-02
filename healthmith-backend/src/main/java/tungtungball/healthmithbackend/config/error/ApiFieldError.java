package tungtungball.healthmithbackend.config.error;

/**
 * API.md 오류 응답의 field_errors 항목.
 *
 * @param field   요청 JSON 경로 (예: answers.priority_body_parts)
 * @param code    필드 오류 코드 (예: INVALID_INPUT)
 * @param message 해당 입력을 고칠 수 있게 안내하는 문장
 */
public record ApiFieldError(String field, String code, String message) {
}
