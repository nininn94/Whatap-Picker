package io.whatap.picker.lead;

import io.whatap.picker.lead.enums.*;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.util.UUID;

public final class LeadSpecifications {

    private LeadSpecifications() {}

    public static Specification<Lead> eventId(UUID eventId) {
        return (root, q, cb) -> eventId == null ? null : cb.equal(root.get("eventId"), eventId);
    }

    public static Specification<Lead> industry(Industry value) {
        return (root, q, cb) -> value == null ? null : cb.equal(root.get("industry"), value);
    }

    public static Specification<Lead> jobFunction(JobFunction value) {
        return (root, q, cb) -> value == null ? null : cb.equal(root.get("jobFunction"), value);
    }

    public static Specification<Lead> jobLevel(JobLevel value) {
        return (root, q, cb) -> value == null ? null : cb.equal(root.get("jobLevel"), value);
    }

    public static Specification<Lead> companySize(CompanySize value) {
        return (root, q, cb) -> value == null ? null : cb.equal(root.get("companySize"), value);
    }

    public static Specification<Lead> employeeCountRange(EmployeeCountRange value) {
        return (root, q, cb) -> value == null ? null : cb.equal(root.get("employeeCountRange"), value);
    }

    public static Specification<Lead> monitoringStatus(MonitoringStatus value) {
        return (root, q, cb) -> value == null ? null : cb.equal(root.get("monitoringStatus"), value);
    }

    public static Specification<Lead> planWithinYear(PlanWithinYear value) {
        return (root, q, cb) -> value == null ? null : cb.equal(root.get("planWithinYear"), value);
    }

    public static Specification<Lead> consultationPreference(ConsultationPreference value) {
        return (root, q, cb) -> value == null ? null : cb.equal(root.get("consultationPreference"), value);
    }

    public static Specification<Lead> adoptionBlocker(AdoptionBlocker value) {
        return (root, q, cb) -> value == null ? null : cb.equal(root.get("adoptionBlocker"), value);
    }

    /** name / email / phone / company 키워드 OR 검색 (대소문자 무시, 부분일치). */
    public static Specification<Lead> keyword(String q) {
        if (q == null || q.isBlank()) return (r, c, cb) -> null;
        String like = "%" + q.trim().toLowerCase() + "%";
        return (root, query, cb) -> {
            Predicate p1 = cb.like(cb.lower(root.get("fullName")), like);
            Predicate p2 = cb.like(cb.lower(root.get("email")),    like);
            Predicate p3 = cb.like(root.get("phone"),              like);
            Predicate p4 = cb.like(cb.lower(root.get("company")),  like);
            return cb.or(p1, p2, p3, p4);
        };
    }
}
