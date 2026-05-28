package io.whatap.picker.lead;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface EmailRejectionLogRepository extends JpaRepository<EmailRejectionLog, UUID> {
    long countByEventId(UUID eventId);
}
