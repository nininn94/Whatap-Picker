package io.whatap.picker.draw.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.OffsetDateTime;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record DrawResponse(
        Short rank,
        String prizeName,
        boolean outOfStock,
        OffsetDateTime drawnAt,
        OperatorRef drawnBy
) {
    public record OperatorRef(UUID id, String username) {}
}
