package tungtungball.healthmithbackend.config.error;

import java.lang.reflect.Method;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 오류 경로를 API.md의 JSON 경로 형식(snake_case, 점 구분)으로 바꾼다.
 */
final class ErrorFieldPaths {

    private static final Pattern CAMEL_BOUNDARY = Pattern.compile("([a-z0-9])([A-Z])");

    private ErrorFieldPaths() {
    }

    /** Bean Validation 경로(answers.priorityBodyParts[0])를 JSON 경로(answers.priority_body_parts[0])로 바꾼다. */
    static String toSnakeCase(String path) {
        if (path == null) {
            return "";
        }
        return CAMEL_BOUNDARY.matcher(path).replaceAll("$1_$2").toLowerCase();
    }

    /**
     * JSON 읽기 오류의 원인 중 Jackson 예외에서 필드 경로를 찾는다. 없으면 null.
     * Jackson 2·3의 패키지가 달라 클래스에 직접 의존하지 않고 getPath()를 읽는다.
     */
    static String findJsonPath(Throwable error) {
        for (Throwable current = error; current != null; current = current.getCause()) {
            String path = readPath(current);
            if (path != null && !path.isEmpty()) {
                return toSnakeCase(path);
            }
            if (current.getCause() == current) {
                break;
            }
        }
        return null;
    }

    private static String readPath(Throwable error) {
        try {
            Method getPath = error.getClass().getMethod("getPath");
            Object value = getPath.invoke(error);
            if (!(value instanceof List<?> references) || references.isEmpty()) {
                return null;
            }
            StringBuilder path = new StringBuilder();
            for (Object reference : references) {
                String name = readName(reference);
                if (name != null) {
                    if (!path.isEmpty()) {
                        path.append('.');
                    }
                    path.append(name);
                } else {
                    int index = readIndex(reference);
                    if (index >= 0) {
                        path.append('[').append(index).append(']');
                    }
                }
            }
            return path.toString();
        } catch (ReflectiveOperationException | RuntimeException ignored) {
            return null;
        }
    }

    private static String readName(Object reference) throws ReflectiveOperationException {
        for (String methodName : List.of("getPropertyName", "getFieldName")) {
            try {
                Object name = reference.getClass().getMethod(methodName).invoke(reference);
                if (name instanceof String text && !text.isEmpty()) {
                    return text;
                }
            } catch (NoSuchMethodException ignored) {
                // 다른 Jackson 버전의 메서드 이름을 시도한다.
            }
        }
        return null;
    }

    private static int readIndex(Object reference) throws ReflectiveOperationException {
        try {
            Object index = reference.getClass().getMethod("getIndex").invoke(reference);
            return index instanceof Integer number ? number : -1;
        } catch (NoSuchMethodException ignored) {
            return -1;
        }
    }
}
