package io.whatap.picker.ai;

import io.whatap.picker.ai.enums.AiStatus;
import io.whatap.picker.ai.enums.Grade;
import io.whatap.picker.ai.enums.NextAction;
import io.whatap.picker.ai.enums.ScoreSource;
import io.whatap.picker.auth.jwt.AppPrincipal;
import io.whatap.picker.common.ApiException;
import io.whatap.picker.common.ErrorCode;
import jakarta.validation.constraints.NotNull;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@RestController
public class AiController {

    private final LeadScoringPipeline pipeline;
    private final LeadScoreRepository repository;

    public AiController(LeadScoringPipeline pipeline, LeadScoreRepository repository) {
        this.pipeline = pipeline;
        this.repository = repository;
    }

    @PostMapping("/api/ai/lead-score")
    @PreAuthorize("hasAnyRole('OPERATOR','ADMIN')")
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

    public record ScoreRequest(@NotNull UUID leadId, Boolean force) {}
    public record OverrideRequest(Grade grade, Short score, NextAction nextAction, String reason) {}
}
