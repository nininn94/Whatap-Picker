package io.whatap.picker.admin;

import io.whatap.picker.admin.dto.UserCreateRequest;
import io.whatap.picker.admin.dto.UserUpdateRequest;
import io.whatap.picker.auth.AppUser;
import io.whatap.picker.auth.AppUserRepository;
import io.whatap.picker.auth.jwt.AppPrincipal;
import io.whatap.picker.common.ApiException;
import io.whatap.picker.common.ErrorCode;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserController {

    private final AppUserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public AdminUserController(AppUserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @PostMapping
    public Map<String, Object> create(@Valid @RequestBody UserCreateRequest req,
                                      @AuthenticationPrincipal AppPrincipal actor) {
        if (userRepository.existsByUsername(req.username())) {
            throw new ApiException(ErrorCode.IN_USE, "이미 사용 중인 username 입니다.");
        }
        AppUser user = new AppUser(req.username(), passwordEncoder.encode(req.password()), req.role());
        if (actor != null) user.setCreatedBy(actor.userId());
        user = userRepository.save(user);
        return toView(user);
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return userRepository.findAll().stream().map(this::toView).toList();
    }

    @PatchMapping("/{id}")
    public Map<String, Object> update(@PathVariable UUID id, @RequestBody UserUpdateRequest req) {
        AppUser user = userRepository.findById(id)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "사용자를 찾을 수 없습니다."));
        if (req.enabled() != null) user.setEnabled(req.enabled());
        if (req.role() != null) user.setRole(req.role());
        if (req.newPassword() != null && !req.newPassword().isBlank()) {
            user.setPasswordHash(passwordEncoder.encode(req.newPassword()));
        }
        userRepository.save(user);
        return toView(user);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable UUID id, @AuthenticationPrincipal AppPrincipal actor) {
        if (actor != null && actor.userId().equals(id)) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "본인 계정은 삭제할 수 없습니다.");
        }
        AppUser user = userRepository.findById(id)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "사용자를 찾을 수 없습니다."));
        userRepository.delete(user);
    }

    private Map<String, Object> toView(AppUser u) {
        return Map.of(
                "id", u.getId(),
                "username", u.getUsername(),
                "role", u.getRole(),
                "enabled", u.isEnabled(),
                "createdAt", u.getCreatedAt()
        );
    }
}
