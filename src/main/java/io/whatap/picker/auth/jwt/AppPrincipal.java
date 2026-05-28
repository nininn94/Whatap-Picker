package io.whatap.picker.auth.jwt;

import io.whatap.picker.auth.Role;

import java.util.UUID;

public record AppPrincipal(UUID userId, String username, Role role) {
    public String roleAuthority() {
        return "ROLE_" + role.name();
    }
}
