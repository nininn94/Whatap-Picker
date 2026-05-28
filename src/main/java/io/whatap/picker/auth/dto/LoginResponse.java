package io.whatap.picker.auth.dto;

import io.whatap.picker.auth.Role;

import java.util.UUID;

public record LoginResponse(
        String accessToken,
        String tokenType,
        long expiresIn,
        Role role,
        UUID userId
) {}
