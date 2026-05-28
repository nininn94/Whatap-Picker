package io.whatap.picker.admin.dto;

import io.whatap.picker.auth.Role;
import jakarta.validation.constraints.Size;

public record UserUpdateRequest(
        Boolean enabled,
        Role role,
        @Size(min = 8, max = 72) String newPassword
) {}
