package io.whatap.picker.ai;

import io.whatap.picker.ai.enums.AiStatus;
import io.whatap.picker.ai.enums.Grade;
import io.whatap.picker.ai.enums.NextAction;
import io.whatap.picker.ai.enums.ScoreSource;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "lead_score")
public class LeadScore {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "lead_id", nullable = false, unique = true)
    private UUID leadId;

    @Enumerated(EnumType.STRING)
    @Column(name = "ai_status", nullable = false, length = 30)
    private AiStatus aiStatus = AiStatus.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(columnDefinition = "varchar(1)")
    private Grade grade;

    private Short score;

    @Enumerated(EnumType.STRING)
    @Column(name = "next_action", length = 40)
    private NextAction nextAction;

    @Column(columnDefinition = "text")
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private ScoreSource source;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "rule_hits", nullable = false, columnDefinition = "jsonb")
    private List<String> ruleHits = List.of();

    @Column(name = "model_name", length = 80)
    private String modelName;

    @Column(name = "model_version", length = 80)
    private String modelVersion;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount = 0;

    @Column(name = "last_attempted_at")
    private OffsetDateTime lastAttemptedAt;

    @Column(name = "manually_overridden_by")
    private UUID manuallyOverriddenBy;

    @Column(name = "manually_overridden_at")
    private OffsetDateTime manuallyOverriddenAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    @PreUpdate
    void onUpdate() { this.updatedAt = OffsetDateTime.now(); }

    public UUID getId() { return id; }
    public UUID getLeadId() { return leadId; }
    public void setLeadId(UUID v) { this.leadId = v; }
    public AiStatus getAiStatus() { return aiStatus; }
    public void setAiStatus(AiStatus v) { this.aiStatus = v; }
    public Grade getGrade() { return grade; }
    public void setGrade(Grade v) { this.grade = v; }
    public Short getScore() { return score; }
    public void setScore(Short v) { this.score = v; }
    public NextAction getNextAction() { return nextAction; }
    public void setNextAction(NextAction v) { this.nextAction = v; }
    public String getReason() { return reason; }
    public void setReason(String v) { this.reason = v; }
    public ScoreSource getSource() { return source; }
    public void setSource(ScoreSource v) { this.source = v; }
    public List<String> getRuleHits() { return ruleHits; }
    public void setRuleHits(List<String> v) { this.ruleHits = v; }
    public String getModelName() { return modelName; }
    public void setModelName(String v) { this.modelName = v; }
    public String getModelVersion() { return modelVersion; }
    public void setModelVersion(String v) { this.modelVersion = v; }
    public int getAttemptCount() { return attemptCount; }
    public void setAttemptCount(int v) { this.attemptCount = v; }
    public OffsetDateTime getLastAttemptedAt() { return lastAttemptedAt; }
    public void setLastAttemptedAt(OffsetDateTime v) { this.lastAttemptedAt = v; }
    public UUID getManuallyOverriddenBy() { return manuallyOverriddenBy; }
    public void setManuallyOverriddenBy(UUID v) { this.manuallyOverriddenBy = v; }
    public OffsetDateTime getManuallyOverriddenAt() { return manuallyOverriddenAt; }
    public void setManuallyOverriddenAt(OffsetDateTime v) { this.manuallyOverriddenAt = v; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
