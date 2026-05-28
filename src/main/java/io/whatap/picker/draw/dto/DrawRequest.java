package io.whatap.picker.draw.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record DrawRequest(
        @NotNull UUID leadId,
        @NotBlank String eventCode
) {}
