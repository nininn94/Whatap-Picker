package io.whatap.picker.ai;

import io.whatap.picker.ai.enums.AiStatus;
import io.whatap.picker.ai.enums.Grade;
import io.whatap.picker.ai.enums.NextAction;
import io.whatap.picker.ai.enums.ScoreSource;
import io.whatap.picker.auth.jwt.AppPrincipal;
import io.whatap.picker.common.ApiException;
import io.whatap.picker.common.ErrorCode;
import io.whatap.picker.event.EventRepository;
import io.whatap.picker.lead.LeadRepository;
import jakarta.validation.constraints.NotNull;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
public class AiController {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(AiController.class);

    private final LeadScoringPipeline pipeline;
    private final LeadScoreRepository repository;
    private final LeadRepository leadRepository;
    private final EventRepository eventRepository;

    public AiController(LeadScoringPipeline pipeline,
                        LeadScoreRepository repository,
                        LeadRepository leadRepository,
                        EventRepository eventRepository) {
        this.pipeline = pipeline;
        this.repository = repository;
        this.leadRepository = leadRepository;
        this.eventRepository = eventRepository;
    }

    @PostMapping("/api/ai/lead-score")
    @PreAuthorize("hasRole('ADMIN')")
    public LeadScore score(@RequestBody ScoreRequest req) {
        if (req == null || req.leadId() == null) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "leadId 가 필요합니다.");
        }
        if (Boolean.TRUE.equals(req.force())) {
            repository.findByLeadId(req.leadId()).ifPresent(s -> {
                s.setAiStatus(AiStatus.PENDING);
                repository.save(s);
            });
        }
        return pipeline.score(req.leadId());
    }

    @PatchMapping("/api/admin/leads/{leadId}/score")
    @PreAuthorize("hasRole('ADMIN')")
    public LeadScore override(@PathVariable UUID leadId,
                              @RequestBody OverrideRequest req,
                              @AuthenticationPrincipal AppPrincipal actor) {
        LeadScore score = repository.findByLeadId(leadId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "AI 평가 기록을 찾을 수 없습니다."));
        if (req.grade() != null) score.setGrade(req.grade());
        if (req.score() != null) score.setScore(req.score());
        if (req.nextAction() != null) score.setNextAction(req.nextAction());
        if (req.reason() != null) score.setReason(req.reason());
        score.setSource(ScoreSource.MANUAL);
        score.setAiStatus(AiStatus.MANUAL_OVERRIDE);
        score.setManuallyOverriddenBy(actor != null ? actor.userId() : null);
        score.setManuallyOverriddenAt(OffsetDateTime.now());
        return repository.save(score);
    }

    @GetMapping("/api/admin/leads/pending-scores")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> pendingScores() {
        List<LeadScore> pending = repository.findByAiStatus(AiStatus.PENDING);
        List<LeadScore> failed = repository.findByAiStatus(AiStatus.FAILED);
        return Map.of(
                "pendingCount", pending.size(),
                "failedCount", failed.size(),
                "pending", pending.stream().<Map<String,Object>>map(s -> Map.of(
                        "leadId", s.getLeadId(),
                        "attemptCount", s.getAttemptCount(),
                        "lastAttemptedAt", s.getLastAttemptedAt() == null ? "" : s.getLastAttemptedAt())).toList(),
                "failed", failed.stream().<Map<String,Object>>map(s -> Map.of(
                        "leadId", s.getLeadId(),
                        "attemptCount", s.getAttemptCount(),
                        "reason", s.getReason() == null ? "" : s.getReason())).toList()
        );
    }

    @PostMapping("/api/admin/leads/rescore")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> rescore(@RequestBody RescoreRequest req) {
        final UUID eventId;
        if (req != null && req.eventCode() != null && !req.eventCode().isBlank()) {
            eventId = eventRepository.findByEventCode(req.eventCode())
                    .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND))
                    .getId();
        } else {
            eventId = null;
        }

        boolean all = req != null && Boolean.TRUE.equals(req.all());

        // 처리할 leadId 수집 — all 모드는 Lead 테이블 직접 순회(누락된 LeadScore 도 새로 생성).
        // 비-all 모드는 기존 LeadScore 의 status 로 필터.
        List<UUID> leadIds = new java.util.ArrayList<>();
        if (all) {
            for (var l : leadRepository.findAll()) {
                if (eventId != null && !eventId.equals(l.getEventId())) continue;
                // MANUAL_OVERRIDE 은 보존
                var existing = repository.findByLeadId(l.getId()).orElse(null);
                if (existing != null && existing.getAiStatus() == AiStatus.MANUAL_OVERRIDE) continue;
                leadIds.add(l.getId());
            }
        } else {
            List<LeadScore> targets = new java.util.ArrayList<>();
            if (req != null && req.aiStatus() != null) {
                targets.addAll(repository.findByAiStatus(req.aiStatus()));
            } else {
                targets.addAll(repository.findByAiStatus(AiStatus.PENDING));
                targets.addAll(repository.findByAiStatus(AiStatus.FAILED));
            }
            for (LeadScore s : targets) {
                if (eventId == null
                        || leadRepository.findById(s.getLeadId())
                            .map(l -> l.getEventId().equals(eventId)).orElse(false)) {
                    leadIds.add(s.getLeadId());
                }
            }
        }
        log.info("rescore all={} eventCode={} candidates={}", all,
                req == null ? null : req.eventCode(), leadIds.size());

        long queued = 0; long failed = 0;
        for (UUID id : leadIds) {
            try { pipeline.score(id); queued++; }
            catch (Exception e) { failed++; log.warn("rescore failed leadId={}: {}", id, e.toString()); }
        }

        // 처리 후 Stage 분포 — UI 가 결과 검증할 수 있도록.
        java.util.Map<String, Long> dist = new java.util.LinkedHashMap<>();
        dist.put("MQL", 0L); dist.put("KNOWN_LEAD", 0L); dist.put("PENDING_OR_OTHER", 0L);
        long leadCount = 0;
        for (var l : leadRepository.findAll()) {
            if (eventId != null && !eventId.equals(l.getEventId())) continue;
            leadCount++;
            var s = repository.findByLeadId(l.getId()).orElse(null);
            if (s == null || s.getGrade() == null) dist.merge("PENDING_OR_OTHER", 1L, Long::sum);
            else dist.merge(s.getGrade().name(), 1L, Long::sum);
        }
        log.info("rescore done queued={} failed={} leads={} dist={}", queued, failed, leadCount, dist);

        java.util.Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("queued", queued);
        out.put("failed", failed);
        out.put("candidates", leadIds.size());
        out.put("totalLeads", leadCount);
        out.put("distribution", dist);
        return out;
    }

    public record ScoreRequest(@NotNull UUID leadId, Boolean force) {}
    public record OverrideRequest(Grade grade, Short score, NextAction nextAction, String reason) {}
    public record RescoreRequest(String eventCode, AiStatus aiStatus, Boolean all) {}
}
