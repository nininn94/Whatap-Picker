package io.whatap.picker.lead;

import io.whatap.picker.lead.enums.*;
import io.whatap.picker.lead.payload.SurveyPayload;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "lead")
public class Lead {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "event_id", nullable = false)
    private UUID eventId;

    @Column(name = "first_name", nullable = false, length = 40)
    private String firstName;

    @Column(name = "last_name", nullable = false, length = 40)
    private String lastName;

    @Column(name = "full_name", insertable = false, updatable = false)
    private String fullName;

    @Column(nullable = false, length = 11)
    private String phone;

    @Column(name = "phone_last4", insertable = false, updatable = false, length = 4)
    private String phoneLast4;

    @Column(length = 120)
    private String company;

    @Column(nullable = false, length = 160)
    private String email;

    @Column(name = "email_domain", nullable = false, length = 120)
    private String emailDomain;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private Industry industry;

    @Enumerated(EnumType.STRING)
    @Column(name = "job_function", nullable = false, length = 40)
    private JobFunction jobFunction;

    @Enumerated(EnumType.STRING)
    @Column(name = "job_level", nullable = false, length = 40)
    private JobLevel jobLevel;

    @Enumerated(EnumType.STRING)
    @Column(name = "company_size", nullable = false, length = 40)
    private CompanySize companySize;

    @Enumerated(EnumType.STRING)
    @Column(name = "employee_count_range", nullable = false, length = 40)
    private EmployeeCountRange employeeCountRange;

    @Enumerated(EnumType.STRING)
    @Column(name = "monitoring_status", nullable = false, length = 40)
    private MonitoringStatus monitoringStatus;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "survey_payload", nullable = false, columnDefinition = "jsonb")
    private SurveyPayload surveyPayload;

    @Enumerated(EnumType.STRING)
    @Column(name = "adoption_blocker", length = 40)
    private AdoptionBlocker adoptionBlocker;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "interest_products", nullable = false, columnDefinition = "jsonb")
    private List<InterestProduct> interestProducts;

    @Enumerated(EnumType.STRING)
    @Column(name = "plan_within_year", length = 40)
    private PlanWithinYear planWithinYear;

    @Enumerated(EnumType.STRING)
    @Column(name = "consultation_preference", length = 40)
    private ConsultationPreference consultationPreference;

    @Column(name = "wants_consultation", nullable = false)
    private boolean wantsConsultation;

    @Column(name = "privacy_consent_at", nullable = false)
    private OffsetDateTime privacyConsentAt;

    @Column(name = "marketing_consent_at", nullable = false)
    private OffsetDateTime marketingConsentAt;

    @Column(name = "retention_until", nullable = false)
    private LocalDate retentionUntil;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    @PreUpdate
    void onUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }

    // -- Getters / Setters (간략 생성) --
    public UUID getId() { return id; }
    public UUID getEventId() { return eventId; }
    public void setEventId(UUID eventId) { this.eventId = eventId; }
    public String getFirstName() { return firstName; }
    public void setFirstName(String v) { this.firstName = v; }
    public String getLastName() { return lastName; }
    public void setLastName(String v) { this.lastName = v; }
    public String getFullName() { return fullName; }
    public String getPhone() { return phone; }
    public void setPhone(String v) { this.phone = v; }
    public String getPhoneLast4() { return phoneLast4; }
    public String getCompany() { return company; }
    public void setCompany(String v) { this.company = v; }
    public String getEmail() { return email; }
    public void setEmail(String v) { this.email = v; }
    public String getEmailDomain() { return emailDomain; }
    public void setEmailDomain(String v) { this.emailDomain = v; }
    public Industry getIndustry() { return industry; }
    public void setIndustry(Industry v) { this.industry = v; }
    public JobFunction getJobFunction() { return jobFunction; }
    public void setJobFunction(JobFunction v) { this.jobFunction = v; }
    public JobLevel getJobLevel() { return jobLevel; }
    public void setJobLevel(JobLevel v) { this.jobLevel = v; }
    public CompanySize getCompanySize() { return companySize; }
    public void setCompanySize(CompanySize v) { this.companySize = v; }
    public EmployeeCountRange getEmployeeCountRange() { return employeeCountRange; }
    public void setEmployeeCountRange(EmployeeCountRange v) { this.employeeCountRange = v; }
    public MonitoringStatus getMonitoringStatus() { return monitoringStatus; }
    public void setMonitoringStatus(MonitoringStatus v) { this.monitoringStatus = v; }
    public SurveyPayload getSurveyPayload() { return surveyPayload; }
    public void setSurveyPayload(SurveyPayload v) { this.surveyPayload = v; }
    public AdoptionBlocker getAdoptionBlocker() { return adoptionBlocker; }
    public void setAdoptionBlocker(AdoptionBlocker v) { this.adoptionBlocker = v; }
    public List<InterestProduct> getInterestProducts() { return interestProducts; }
    public void setInterestProducts(List<InterestProduct> v) { this.interestProducts = v; }
    public PlanWithinYear getPlanWithinYear() { return planWithinYear; }
    public void setPlanWithinYear(PlanWithinYear v) { this.planWithinYear = v; }
    public ConsultationPreference getConsultationPreference() { return consultationPreference; }
    public void setConsultationPreference(ConsultationPreference v) { this.consultationPreference = v; }
    public boolean isWantsConsultation() { return wantsConsultation; }
    public void setWantsConsultation(boolean v) { this.wantsConsultation = v; }
    public OffsetDateTime getPrivacyConsentAt() { return privacyConsentAt; }
    public void setPrivacyConsentAt(OffsetDateTime v) { this.privacyConsentAt = v; }
    public OffsetDateTime getMarketingConsentAt() { return marketingConsentAt; }
    public void setMarketingConsentAt(OffsetDateTime v) { this.marketingConsentAt = v; }
    public LocalDate getRetentionUntil() { return retentionUntil; }
    public void setRetentionUntil(LocalDate v) { this.retentionUntil = v; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
