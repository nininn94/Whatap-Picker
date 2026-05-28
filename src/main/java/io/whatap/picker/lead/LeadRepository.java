package io.whatap.picker.lead;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LeadRepository extends JpaRepository<Lead, UUID> {

    Optional<Lead> findByPhoneAndEventId(String phone, UUID eventId);

    List<Lead> findByEventIdAndFullNameAndPhoneLast4(UUID eventId, String fullName, String phoneLast4);

    long countByEventId(UUID eventId);

    List<Lead> findByRetentionUntilBefore(LocalDate cutoff);
}
