package io.whatap.picker.lead.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.whatap.picker.lead.enums.JobFunction;
import io.whatap.picker.lead.enums.JobLevel;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record LeadSearchResponse(
        String eventCode,
        LocalDate eventDate,
        List<Item> results
) {
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Item(
            UUID leadId,
            String name,
            JobFunction jobFunction,
            JobLevel jobLevel,
            String company,
            boolean drawn,
            OffsetDateTime drawnAt,
            AiStatusInfo ai
    ) {}

    public record AiStatusInfo(String status, String grade, Integer score) {}
}
