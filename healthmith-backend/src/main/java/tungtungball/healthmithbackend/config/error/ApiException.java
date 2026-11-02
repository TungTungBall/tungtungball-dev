package tungtungball.healthmithbackend.config.error;

import org.springframework.http.HttpStatusCode;

import java.util.List;

/**
 * 업무 규칙 오류를 API.md 형식으로 돌려줄 때 서버 코드가 던지는 예외.
 * 예: new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SURVEY", "입력 내용을 확인해 주세요.",
 *         List.of(new ApiFieldError("answers.priority_body_parts", "BODY_PART_CONFLICT", "...")))
 */
public class ApiException extends RuntimeException {

    private final HttpStatusCode status;
    private final String code;
    private final List<ApiFieldError> fieldErrors;

    public ApiException(HttpStatusCode status, String code, String message, List<ApiFieldError> fieldErrors) {
        super(message);
        this.status = status;
        this.code = code;
        this.fieldErrors = fieldErrors == null ? List.of() : List.copyOf(fieldErrors);
    }

    public HttpStatusCode getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    public List<ApiFieldError> getFieldErrors() {
        return fieldErrors;
    }
}
