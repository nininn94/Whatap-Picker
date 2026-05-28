package io.whatap.picker.lead;

import io.whatap.picker.lead.enums.*;
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

    public static Specification<Lead> jobLevel(JobLevel value) {
        return (root, q, cb) -> value == null ? null : cb.equal(root.get("jobLevel"), value);
    }

    public static Specification<Lead> monitoringStatus(MonitoringStatus value) {
        return (root, q, cb) -> value == null ? null : cb.equal(root.get("monitoringStatus"), value);
    }

    public static Specification<Lead> planWithinYear(PlanWithinYear value) {
        return (root, q, cb) -> value == null ? null : cb.equal(root.get("planWithinYear"), value);
    }
}
