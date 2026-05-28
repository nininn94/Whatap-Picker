package io.whatap.picker.admin.dto;

import io.whatap.picker.event.EventStatus;

import java.time.LocalDate;

public record EventUpdateRequest(
        String label,
        LocalDate eventDate,
        LocalDate endDate,
        EventStatus status
) {}
