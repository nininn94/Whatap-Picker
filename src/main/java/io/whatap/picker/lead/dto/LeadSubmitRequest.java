package io.whatap.picker.lead.dto;

import io.whatap.picker.lead.enums.*;
import io.whatap.picker.lead.payload.SurveyPayload;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record LeadSubmitRequest(

        @NotBlank String eventCode,

        @NotBlank @Size(max = 20) String firstName,
        @NotBlank @Size(max = 20) String lastName,
        @Size(max = 120) String company,
        @NotBlank @Email String email,
        @NotBlank String phone,

        @NotNull Industry industry,
        @NotNull JobFunction jobFunction,
        @NotNull JobLevel jobLevel,
        @NotNull CompanySize companySize,
        @NotNull EmployeeCountRange employeeCountRange,

        @NotNull MonitoringStatus monitoringStatus,
        @NotNull SurveyPayload surveyPayload,

        AdoptionBlocker adoptionBlocker,
        @NotEmpty List<InterestProduct> interestProducts,
        PlanWithinYear planWithinYear,
        ConsultationPreference consultationPreference,

        @AssertTrue(message = "개인정보 수집 동의는 필수입니다.")
        Boolean privacyConsent,

        @AssertTrue(message = "마케팅 활용 동의는 필수입니다.")
        Boolean marketingConsent
) {}
