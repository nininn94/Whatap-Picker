package io.whatap.picker.common;

import java.time.OffsetDateTime;
import java.util.List;

public record ApiErrorResponse(
        String code,
        String message,
        OffsetDateTime timestamp,
        List<FieldError> errors
) {
    public record FieldError(String field, String message) {}

    public static ApiErrorResponse of(ErrorCode code, String message) {
        return new ApiErrorResponse(code.name(), message, OffsetDateTime.now(), List.of());
    }

    public static ApiErrorResponse of(ErrorCode code, String message, List<FieldError> errors) {
        return new ApiErrorResponse(code.name(), message, OffsetDateTime.now(), errors);
    }
}
