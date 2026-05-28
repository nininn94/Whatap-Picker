package io.whatap.picker.prize;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "prize")
public class Prize {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "event_id", nullable = false)
    private UUID eventId;

    @Column(nullable = false)
    private Short rank;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(name = "initial_qty", nullable = false)
    private Integer initialQty;

    @Column(name = "remaining_qty", nullable = false)
    private Integer remainingQty;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    @PreUpdate
    void onUpdate() { updatedAt = OffsetDateTime.now(); }

    protected Prize() {}

    public Prize(UUID eventId, short rank, String name, int initialQty) {
        this.eventId = eventId;
        this.rank = rank;
        this.name = name;
        this.initialQty = initialQty;
        this.remainingQty = initialQty;
    }

    public UUID getId() { return id; }
    public UUID getEventId() { return eventId; }
    public Short getRank() { return rank; }
    public String getName() { return name; }
    public void setName(String v) { this.name = v; }
    public Integer getInitialQty() { return initialQty; }
    public void setInitialQty(Integer v) { this.initialQty = v; }
    public Integer getRemainingQty() { return remainingQty; }
    public void setRemainingQty(Integer v) { this.remainingQty = v; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
