package io.whatap.picker.lead;

import io.whatap.picker.lead.enums.JobFunction;
import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "email_rejection_log")
public class EmailRejectionLog {

    public enum Reason { BLOCKED_DOMAIN, INVALID_FORMAT, CONSENT_MISSING }

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "event_id")
    private UUID eventId;

    @Column(name = "attempted_email_hash", length = 64)
    private String attemptedEmailHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private Reason reason;

    @Enumerated(EnumType.STRING)
    @Column(name = "job_function", length = 40)
    private JobFunction jobFunction;

    @Column(name = "ip_hash", length = 64)
    private String ipHash;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    protected EmailRejectionLog() {}

    public EmailRejectionLog(UUID eventId, String attemptedEmailHash, Reason reason,
                             JobFunction jobFunction, String ipHash) {
        this.eventId = eventId;
        this.attemptedEmailHash = attemptedEmailHash;
        this.reason = reason;
        this.jobFunction = jobFunction;
        this.ipHash = ipHash;
    }
}
