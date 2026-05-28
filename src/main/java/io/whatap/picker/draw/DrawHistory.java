package io.whatap.picker.draw;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "draw_history")
public class DrawHistory {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "lead_id")
    private UUID leadId;

    @Column(name = "event_id", nullable = false)
    private UUID eventId;

    @Column(name = "prize_id")
    private UUID prizeId;

    @Column(name = "awarded_rank")
    private Short awardedRank;

    @Column(name = "drawn_by")
    private UUID drawnBy;

    @Column(name = "drawn_at", nullable = false, updatable = false)
    private OffsetDateTime drawnAt = OffsetDateTime.now();

    protected DrawHistory() {}

    public DrawHistory(UUID leadId, UUID eventId, UUID prizeId, Short awardedRank, UUID drawnBy) {
        this.leadId = leadId;
        this.eventId = eventId;
        this.prizeId = prizeId;
        this.awardedRank = awardedRank;
        this.drawnBy = drawnBy;
    }

    public UUID getId() { return id; }
    public UUID getLeadId() { return leadId; }
    public UUID getEventId() { return eventId; }
    public UUID getPrizeId() { return prizeId; }
    public Short getAwardedRank() { return awardedRank; }
    public UUID getDrawnBy() { return drawnBy; }
    public OffsetDateTime getDrawnAt() { return drawnAt; }
}
