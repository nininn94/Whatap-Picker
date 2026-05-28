package io.whatap.picker.lead.payload;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * monitoringStatus에 따라 한 개 필드만 채워짐.
 *  - USING_WHATAP  → whatap
 *  - USING_OTHER   → other
 *  - NOT_USING     → notUsing
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SurveyPayload(
        WhatapAnswer whatap,
        OtherAnswer other,
        NotUsingAnswer notUsing
) {

    public record WhatapAnswer(
            int proficiency,
            List<String> neededHelps
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record OtherAnswer(
            List<String> commercialProducts,
            String commercialOther,
            List<String> openSourceProducts,
            String openSourceOther,
            CommercialDetail commercial,
            OpenSourceDetail openSource
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record CommercialDetail(
            String deployment,           // PUBLIC_SAAS | PRIVATE_SAAS | ON_PREMISE
            String satisfaction,         // VERY_SATISFIED ... VERY_DISSATISFIED
            List<String> complaints,
            String complaintsOther,
            String annualBudget,
            String costPerception,
            String switchReason
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record OpenSourceDetail(
            List<String> deployment,
            String satisfaction,
            List<String> difficulties
    ) {}

    public record NotUsingAnswer(
            List<String> concerns,
            List<String> frequentIssues
    ) {}
}
