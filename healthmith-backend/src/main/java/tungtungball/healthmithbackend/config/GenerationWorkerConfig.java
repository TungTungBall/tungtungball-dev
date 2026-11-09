package tungtungball.healthmithbackend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@Configuration
@EnableConfigurationProperties(GenerationWorkerProperties.class)
public class GenerationWorkerConfig { }
