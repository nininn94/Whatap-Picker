package io.whatap.picker.common.rate;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

@Configuration
public class RateLimitConfig {

    @Bean(name = "loginRateLimiter")
    public RateLimiter loginRateLimiter(
            @Value("${security.rate-limit.login-attempts-per-15min:5}") int attempts) {
        return new RateLimiter(attempts, Duration.ofMinutes(15));
    }

    @Bean(name = "leadSubmitRateLimiter")
    public RateLimiter leadSubmitRateLimiter(
            @Value("${security.rate-limit.lead-submit-per-min-per-ip:10}") int attempts) {
        return new RateLimiter(attempts, Duration.ofMinutes(1));
    }
}
