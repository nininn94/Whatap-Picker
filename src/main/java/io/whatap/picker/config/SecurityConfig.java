package io.whatap.picker.config;

import io.whatap.picker.auth.jwt.JwtAuthenticationFilter;
import io.whatap.picker.auth.jwt.JwtProperties;
import io.whatap.picker.auth.jwt.JwtTokenProvider;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableConfigurationProperties(JwtProperties.class)
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                   JwtTokenProvider tokenProvider) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // 공개 — 부스 운영자가 별도 로그인 없이 사용 (기획서 운영자 흐름)
                        .requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/logout").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/leads").permitAll()
                        .requestMatchers(HttpMethod.GET,  "/api/leads/search").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/draw").permitAll()
                        .requestMatchers(HttpMethod.GET,  "/api/draw/history").permitAll()
                        .requestMatchers(HttpMethod.GET,  "/api/prizes").permitAll()
                        .requestMatchers(HttpMethod.GET,  "/api/events").permitAll()
                        .requestMatchers("/admin/login", "/admin/login/**").permitAll()
                        .requestMatchers("/survey/**", "/event/**", "/").permitAll()
                        .requestMatchers("/swagger-ui/**", "/v3/api-docs/**", "/actuator/health").permitAll()
                        .requestMatchers("/css/**", "/js/**", "/images/**", "/favicon.ico").permitAll()
                        // 어드민 전용
                        .requestMatchers("/api/admin/**", "/admin/**").hasRole("ADMIN")
                        // 그 외 인증 필요
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().authenticated()
                )
                .exceptionHandling(ex -> ex
                        .defaultAuthenticationEntryPointFor(
                                new org.springframework.security.web.authentication.LoginUrlAuthenticationEntryPoint("/admin/login"),
                                new org.springframework.security.web.util.matcher.AntPathRequestMatcher("/admin/**"))
                        .defaultAuthenticationEntryPointFor(
                                new org.springframework.security.web.authentication.HttpStatusEntryPoint(org.springframework.http.HttpStatus.UNAUTHORIZED),
                                new org.springframework.security.web.util.matcher.AntPathRequestMatcher("/api/**"))
                )
                .addFilterBefore(new JwtAuthenticationFilter(tokenProvider),
                                 UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
