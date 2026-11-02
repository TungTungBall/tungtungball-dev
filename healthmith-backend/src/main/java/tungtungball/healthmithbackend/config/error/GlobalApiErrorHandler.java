package tungtungball.healthmithbackend.config.error;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.support.WebExchangeBindException;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.reactive.HandlerMapping;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.ServerWebInputException;

import java.util.ArrayList;
import java.util.List;

/**
 * 컨트롤러에서 난 오류를 API.md 공통 형식(code, message, field_errors)으로 바꾼다.
 * 오류 응답과 로그에 토큰·요청 본문 전체를 넣지 않는다.
 */
@RestControllerAdvice
public class GlobalApiErrorHandler {

    static final String DEFAULT_INVALID_CODE = "INVALID_REQUEST";
    static final String INPUT_ERROR_CODE = "INVALID_INPUT";
    static final String INTERNAL_ERROR_CODE = "INTERNAL_ERROR";

    private static final Logger log = LoggerFactory.getLogger(GlobalApiErrorHandler.class);
    private static final String INVALID_MESSAGE = "입력 내용을 확인해 주세요.";
    private static final String INVALID_FIELD_MESSAGE = "입력 형식이 올바르지 않습니다.";
    private static final String INTERNAL_MESSAGE = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiErrorResponse> handleApiException(ApiException ex) {
        return ResponseEntity.status(ex.getStatus())
                .body(new ApiErrorResponse(ex.getCode(), ex.getMessage(), ex.getFieldErrors()));
    }

    /** @Valid 검증 실패. Java 필드 경로를 JSON 경로로 바꾼다. */
    @ExceptionHandler(WebExchangeBindException.class)
    public ResponseEntity<ApiErrorResponse> handleValidation(WebExchangeBindException ex, ServerWebExchange exchange) {
        List<ApiFieldError> errors = new ArrayList<>();
        ex.getFieldErrors().forEach(error -> errors.add(new ApiFieldError(
                ErrorFieldPaths.toSnakeCase(error.getField()),
                INPUT_ERROR_CODE,
                error.getDefaultMessage() == null ? INVALID_FIELD_MESSAGE : error.getDefaultMessage())));
        ex.getGlobalErrors().forEach(error -> errors.add(new ApiFieldError(
                "",
                INPUT_ERROR_CODE,
                error.getDefaultMessage() == null ? INVALID_FIELD_MESSAGE : error.getDefaultMessage())));
        return badRequest(exchange, errors);
    }

    /** JSON 문법·타입·모르는 필드·누락 필드처럼 본문을 읽지 못한 경우. */
    @ExceptionHandler(ServerWebInputException.class)
    public ResponseEntity<ApiErrorResponse> handleUnreadableInput(ServerWebInputException ex, ServerWebExchange exchange) {
        String field = ErrorFieldPaths.findJsonPath(ex);
        List<ApiFieldError> errors = field == null
                ? List.of()
                : List.of(new ApiFieldError(field, INPUT_ERROR_CODE, INVALID_FIELD_MESSAGE));
        return badRequest(exchange, errors);
    }

    /** 지원하지 않는 Content-Type·메서드 등 프레임워크가 정한 상태 코드. */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiErrorResponse> handleStatus(ResponseStatusException ex) {
        HttpStatusCode status = ex.getStatusCode();
        String code = status instanceof HttpStatus known ? known.name() : "HTTP_" + status.value();
        return ResponseEntity.status(status)
                .body(new ApiErrorResponse(code, "요청을 처리할 수 없습니다.", List.of()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleUnexpected(Exception ex) {
        log.error("처리하지 못한 서버 오류: {}", ex.getClass().getName(), ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiErrorResponse(INTERNAL_ERROR_CODE, INTERNAL_MESSAGE, List.of()));
    }

    private ResponseEntity<ApiErrorResponse> badRequest(ServerWebExchange exchange, List<ApiFieldError> errors) {
        return ResponseEntity.badRequest()
                .body(new ApiErrorResponse(invalidCode(exchange), INVALID_MESSAGE, errors));
    }

    private String invalidCode(ServerWebExchange exchange) {
        Object handler = exchange.getAttribute(HandlerMapping.BEST_MATCHING_HANDLER_ATTRIBUTE);
        if (handler instanceof HandlerMethod method) {
            ApiInputErrorCode annotation = AnnotatedElementUtils.findMergedAnnotation(
                    method.getMethod(), ApiInputErrorCode.class);
            if (annotation == null) {
                annotation = AnnotatedElementUtils.findMergedAnnotation(method.getBeanType(), ApiInputErrorCode.class);
            }
            if (annotation != null) {
                return annotation.value();
            }
        }
        return DEFAULT_INVALID_CODE;
    }
}
