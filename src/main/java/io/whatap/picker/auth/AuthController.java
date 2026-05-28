package io.whatap.picker.auth;

import io.whatap.picker.auth.dto.LoginRequest;
import io.whatap.picker.auth.dto.LoginResponse;
import io.whatap.picker.auth.jwt.JwtAuthenticationFilter;
import io.whatap.picker.common.ClientIp;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseCookie;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request,
                               HttpServletRequest httpRequest,
                               HttpServletResponse httpResponse) {
        LoginResponse body = authService.login(request, ClientIp.of(httpRequest));
        httpResponse.addHeader(HttpHeaders.SET_COOKIE,
                buildCookie(body.accessToken(), body.expiresIn(), httpRequest).toString());
        return body;
    }

    @PostMapping("/logout")
    public void logout(HttpServletRequest req, HttpServletResponse res) {
        res.addHeader(HttpHeaders.SET_COOKIE, buildCookie("", 0, req).toString());
    }

    /**
     * HTTPS 요청이면 SameSite=None+Secure (cross-origin 호환, Vercel↔백엔드),
     * HTTP 요청이면 SameSite=Lax (로컬 개발).
     */
    private static ResponseCookie buildCookie(String value, long maxAgeSeconds, HttpServletRequest req) {
        boolean secure = req.isSecure();
        return ResponseCookie.from(JwtAuthenticationFilter.COOKIE_NAME, value)
                .httpOnly(true)
                .secure(secure)
                .sameSite(secure ? "None" : "Lax")
                .path("/")
                .maxAge(maxAgeSeconds)
                .build();
    }
}
