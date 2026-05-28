package io.whatap.picker.ai;

import io.whatap.picker.ai.enums.AiStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LeadScoreRepository extends JpaRepository<LeadScore, UUID> {
    Optional<LeadScore> findByLeadId(UUID leadId);
    List<LeadScore> findByAiStatus(AiStatus status);
}
