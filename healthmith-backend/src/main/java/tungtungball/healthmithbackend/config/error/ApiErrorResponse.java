package tungtungball.healthmithbackend.config.error;

import java.util.List;

/**
 * API.md 공통 오류 응답. JSON에서는 field_errors로 나간다(전역 SNAKE_CASE).
 */
public record ApiErrorResponse(String code, String message, List<ApiFieldError> fieldErrors) {

    public ApiErrorResponse {
        fieldErrors = fieldErrors == null ? List.of() : List.copyOf(fieldErrors);
    }
}
