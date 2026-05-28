package io.whatap.picker.lead.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

public record LeadSubmitResponse(
        UUID leadId,
        String eventCode,
        UUID eventId,
        OffsetDateTime createdAt,
        LocalDate retentionUntil
) {}
