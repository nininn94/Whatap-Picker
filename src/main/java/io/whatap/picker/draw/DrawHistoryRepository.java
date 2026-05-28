package io.whatap.picker.draw;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface DrawHistoryRepository extends JpaRepository<DrawHistory, UUID> {
    Optional<DrawHistory> findByLeadIdAndEventId(UUID leadId, UUID eventId);
    long countByEventIdAndAwardedRank(UUID eventId, Short awardedRank);
    long countByEventId(UUID eventId);
}
