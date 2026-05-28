package io.whatap.picker.lead;

import io.whatap.picker.common.ApiException;
import io.whatap.picker.common.ClientIp;
import io.whatap.picker.common.ErrorCode;
import io.whatap.picker.common.rate.RateLimiter;
import io.whatap.picker.event.Event;
import io.whatap.picker.event.EventRepository;
import io.whatap.picker.event.EventStatus;
import io.whatap.picker.lead.dto.LeadSubmitRequest;
import io.whatap.picker.lead.dto.LeadSubmitResponse;
import io.whatap.picker.lead.enums.ConsultationPreference;
import io.whatap.picker.lead.enums.JobFunction;
import io.whatap.picker.lead.event.LeadSubmittedEvent;
import io.whatap.picker.lead.payload.SurveyPayload;
import io.whatap.picker.lead.util.PhoneNormalizer;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Locale;

@Service
public class LeadService {

    private final LeadRepository leadRepository;
    private final EventRepository eventRepository;
    private final EmailRejectionLogRepository rejectionRepository;
    private final LeadProperties leadProperties;
    private final RateLimiter submitRateLimiter;
    private final ApplicationEventPublisher eventPublisher;

    public LeadService(LeadRepository leadRepository,
                       EventRepository eventRepository,
                       EmailRejectionLogRepository rejectionRepository,
                       LeadProperties leadProperties,
                       @Qualifier("leadSubmitRateLimiter") RateLimiter submitRateLimiter,
                       ApplicationEventPublisher eventPublisher) {
        this.leadRepository = leadRepository;
        this.eventRepository = eventRepository;
        this.rejectionRepository = rejectionRepository;
        this.leadProperties = leadProperties;
        this.submitRateLimiter = submitRateLimiter;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public LeadSubmitResponse submit(LeadSubmitRequest req, String clientIp) {
        if (!submitRateLimiter.tryConsume(clientIp)) {
            throw new ApiException(ErrorCode.TOO_MANY_REQUESTS,
                    "잠시 후 다시 제출해 주세요. (분당 제한 초과)");
        }

        Event event = eventRepository.findByEventCode(req.eventCode())
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND));
        if (event.getStatus() != EventStatus.OPEN) {
            throw new ApiException(ErrorCode.EVENT_CLOSED);
        }

        String phone = PhoneNormalizer.normalize(req.phone());
        if (phone == null) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED,
                    "휴대폰 번호는 010 포함 11자리여야 하며, 010 다음 첫 자리는 0이 될 수 없습니다.");
        }

        String email = req.email().trim().toLowerCase(Locale.ROOT);
        String domain = email.contains("@") ? email.substring(email.indexOf('@') + 1) : "";
        if (!isEmailAllowed(req.jobFunction(), domain)) {
            rejectionRepository.save(new EmailRejectionLog(
                    event.getId(),
                    ClientIp.hash(email),
                    EmailRejectionLog.Reason.BLOCKED_DOMAIN,
                    req.jobFunction(),
                    ClientIp.hash(clientIp)
            ));
            throw new ApiException(ErrorCode.PERSONAL_EMAIL_NOT_ALLOWED,
                    "회사 이메일을 사용해 주세요. (개인 이메일 도메인은 허용되지 않습니다.)");
        }

        validateSurveyPayload(req);

        OffsetDateTime now = OffsetDateTime.now();
        LocalDate retentionUntil = now.toLocalDate()
                .plusMonths(leadProperties.retentionMonths());

        Lead lead = leadRepository.findByPhoneAndEventId(phone, event.getId())
                .orElseGet(Lead::new);
        lead.setEventId(event.getId());
        lead.setFirstName(req.firstName().trim());
        lead.setLastName(req.lastName().trim());
        lead.setPhone(phone);
        lead.setCompany(req.company() != null ? req.company().trim() : null);
        lead.setEmail(email);
        lead.setEmailDomain(domain);
        lead.setIndustry(req.industry());
        lead.setJobFunction(req.jobFunction());
        lead.setJobLevel(req.jobLevel());
        lead.setCompanySize(req.companySize());
        lead.setEmployeeCountRange(req.employeeCountRange());
        lead.setMonitoringStatus(req.monitoringStatus());
        lead.setSurveyPayload(req.surveyPayload());
        lead.setAdoptionBlocker(req.adoptionBlocker());
        lead.setInterestProducts(req.interestProducts());
        lead.setPlanWithinYear(req.planWithinYear());
        lead.setConsultationPreference(req.consultationPreference());
        lead.setWantsConsultation(req.consultationPreference() == ConsultationPreference.ONSITE_MEETING);
        lead.setPrivacyConsentAt(now);
        lead.setMarketingConsentAt(now);
        lead.setRetentionUntil(retentionUntil);

        lead = leadRepository.save(lead);

        // form 첫 제출 → schema snapshot 잠금 (Phase 3에서 schema 매핑 완성)
        if (!event.isFormLocked() && event.getFormSchemaSnapshot() == null) {
            event.setFormLocked(true);
            eventRepository.save(event);
        }

        eventPublisher.publishEvent(new LeadSubmittedEvent(lead.getId(), event.getId()));

        return new LeadSubmitResponse(
                lead.getId(),
                event.getEventCode(),
                event.getId(),
                lead.getCreatedAt(),
                retentionUntil
        );
    }

    private boolean isEmailAllowed(JobFunction job, String domain) {
        if (job == JobFunction.STUDENT_FREELANCER) return true;
        return leadProperties.blockedEmailDomains().stream()
                .noneMatch(d -> d.equalsIgnoreCase(domain));
    }

    private void validateSurveyPayload(LeadSubmitRequest req) {
        SurveyPayload payload = req.surveyPayload();
        switch (req.monitoringStatus()) {
            case USING_WHATAP -> {
                if (payload.whatap() == null || payload.other() != null || payload.notUsing() != null) {
                    throw new ApiException(ErrorCode.SURVEY_PAYLOAD_MISMATCH,
                            "monitoringStatus=USING_WHATAP 인 경우 surveyPayload.whatap 만 채워야 합니다.");
                }
            }
            case USING_OTHER -> {
                if (payload.other() == null || payload.whatap() != null || payload.notUsing() != null) {
                    throw new ApiException(ErrorCode.SURVEY_PAYLOAD_MISMATCH,
                            "monitoringStatus=USING_OTHER 인 경우 surveyPayload.other 만 채워야 합니다.");
                }
            }
            case NOT_USING -> {
                if (payload.notUsing() == null || payload.whatap() != null || payload.other() != null) {
                    throw new ApiException(ErrorCode.SURVEY_PAYLOAD_MISMATCH,
                            "monitoringStatus=NOT_USING 인 경우 surveyPayload.notUsing 만 채워야 합니다.");
                }
            }
        }
    }
}
