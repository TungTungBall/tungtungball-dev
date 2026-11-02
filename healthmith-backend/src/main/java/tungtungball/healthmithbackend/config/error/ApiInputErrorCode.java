package tungtungball.healthmithbackend.config.error;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 입력 형식·검증 오류(400)의 최상위 code를 API별로 정한다.
 * 컨트롤러 클래스나 메서드에 붙인다. 없으면 INVALID_REQUEST를 쓴다.
 * 예: @ApiInputErrorCode("INVALID_SURVEY")
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.METHOD})
public @interface ApiInputErrorCode {

    String value();
}
