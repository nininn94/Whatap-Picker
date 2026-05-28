package io.whatap.picker.auth.jwt;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import io.whatap.picker.auth.AppUser;
import io.whatap.picker.auth.Role;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Date;
import java.util.UUID;

@Component
public class JwtTokenProvider {

    private final SecretKey key;
    private final Duration expiration;

    public JwtTokenProvider(JwtProperties properties) {
        if (properties.secret() == null || properties.secret().length() < 32) {
            throw new IllegalStateException(
                    "security.jwt.secret must be at least 32 bytes long. Set JWT_SECRET env var.");
        }
        this.key = Keys.hmacShaKeyFor(properties.secret().getBytes(StandardCharsets.UTF_8));
        this.expiration = Duration.ofHours(properties.expirationHours());
    }

    public String issue(AppUser user) {
        Date now = new Date();
        Date exp = new Date(now.getTime() + expiration.toMillis());
        return Jwts.builder()
                .subject(user.getId().toString())
                .claim("username", user.getUsername())
                .claim("role", user.getRole().name())
                .issuedAt(now)
                .expiration(exp)
                .signWith(key)
                .compact();
    }

    public Authn parse(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            UUID userId = UUID.fromString(claims.getSubject());
            String username = claims.get("username", String.class);
            Role role = Role.valueOf(claims.get("role", String.class));
            return new Authn(userId, username, role);
        } catch (JwtException | IllegalArgumentException ex) {
            return null;
        }
    }

    public Duration expiration() { return expiration; }

    public record Authn(UUID userId, String username, Role role) {}
}
