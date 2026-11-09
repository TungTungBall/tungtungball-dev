package tungtungball.healthmithbackend;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.reactive.result.method.annotation.RequestMappingHandlerMapping;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;

/** 노션의 46개 API 목록과 실제 WebFlux 매핑을 대조한다. 업무 검증은 별도 통합 검사에서 수행한다. */
@SpringBootTest
class ApiSpecificationRoutesTest {
    @Autowired RequestMappingHandlerMapping mappings;

    @Test
    void everySpecifiedMethodAndPathHasAnImplementation() throws Exception {
        Set<String> actual = new HashSet<>();
        mappings.getHandlerMethods().forEach((mapping, handler) -> {
            mapping.getMethodsCondition().getMethods().forEach(method ->
                    mapping.getPatternsCondition().getPatterns().forEach(path ->
                            actual.add(method.name() + " " + normalize(path.getPatternString()))));
        });
        try (var input = getClass().getResourceAsStream("/api-contract-paths.txt")) {
            assertNotNull(input);
            var expected = new String(input.readAllBytes(), StandardCharsets.UTF_8).lines().map(this::normalize).toList();
            assertEquals(46, expected.size());
            for (String route : expected) { assertTrue(actual.contains(route), "누락된 명세 경로: " + route); }
        }
    }

    private String normalize(String path) { return path.replaceAll("\\{[^}]+}", "{}"); }
}
