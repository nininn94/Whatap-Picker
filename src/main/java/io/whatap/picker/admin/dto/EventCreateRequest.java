package io.whatap.picker.admin.dto;

import io.whatap.picker.event.EventStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.time.LocalDate;
import java.util.UUID;

/**
 * eventCode 는 선택. 미지정/빈 값이면 서버에서 무작위 생성.
 */
public record EventCreateRequest(
        @Pattern(regexp = "^([a-z0-9][a-z0-9\\-]{0,79})?$",
                message = "event_code 는 소문자/숫자/하이픈만 사용 가능합니다.")
        String eventCode,
        @NotNull LocalDate eventDate,
        LocalDate endDate,
        @NotBlank String label,
        UUID formTemplateId,
        EventStatus status
) {}
