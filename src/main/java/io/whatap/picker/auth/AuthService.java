package io.whatap.picker.auth;

import io.whatap.picker.auth.dto.LoginRequest;
import io.whatap.picker.auth.dto.LoginResponse;
import io.whatap.picker.auth.jwt.JwtTokenProvider;
import io.whatap.picker.common.ApiException;
import io.whatap.picker.common.ErrorCode;
import io.whatap.picker.common.rate.RateLimiter;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    private final AppUserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final RateLimiter loginRateLimiter;

    public AuthService(AppUserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       JwtTokenProvider tokenProvider,
                       @Qualifier("loginRateLimiter") RateLimiter loginRateLimiter) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenProvider = tokenProvider;
        this.loginRateLimiter = loginRateLimiter;
    }

    public LoginResponse login(LoginRequest request, String clientIp) {
        if (!loginRateLimiter.tryConsume(clientIp)) {
            throw new ApiException(ErrorCode.TOO_MANY_REQUESTS,
                    "로그인 시도가 너무 많습니다. 15분 후 다시 시도하세요.");
        }
        AppUser user = userRepository.findByUsername(request.username())
                .orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED, "아이디 또는 비밀번호가 일치하지 않습니다."));
        if (!user.isEnabled()) {
            throw new ApiException(ErrorCode.FORBIDDEN, "비활성화된 계정입니다.");
        }
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new ApiException(ErrorCode.UNAUTHORIZED, "아이디 또는 비밀번호가 일치하지 않습니다.");
        }

        loginRateLimiter.reset(clientIp);
        String token = tokenProvider.issue(user);
        return new LoginResponse(
                token,
                "Bearer",
                tokenProvider.expiration().toSeconds(),
                user.getRole(),
                user.getId()
        );
    }
}
