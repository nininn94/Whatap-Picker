package io.whatap.picker.admin.dashboard;

import io.whatap.picker.ai.LeadScore;
import io.whatap.picker.ai.LeadScoreRepository;
import io.whatap.picker.event.Event;
import io.whatap.picker.event.EventRepository;
import io.whatap.picker.lead.Lead;
import io.whatap.picker.lead.LeadRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/dashboard")
@PreAuthorize("hasRole('ADMIN')")
public class DashboardController {

    private final LeadAnalyticsService service;
    private final MarketingInsightService insightService;
    private final LeadScoreRepository leadScoreRepository;
    private final LeadRepository leadRepository;
    private final EventRepository eventRepository;

    public DashboardController(LeadAnalyticsService service,
                               MarketingInsightService insightService,
                               LeadScoreRepository leadScoreRepository,
                               LeadRepository leadRepository,
                               EventRepository eventRepository) {
        this.service = service;
        this.insightService = insightService;
        this.leadScoreRepository = leadScoreRepository;
        this.leadRepository = leadRepository;
        this.eventRepository = eventRepository;
    }

    @GetMapping("/summary")
    public Map<String, Object> summary(@RequestParam(required = false) String eventCode) {
        return service.summary(eventCode);
    }

    @GetMapping("/timeline")
    public Map<String, Object> timeline(@RequestParam(required = false) LocalDate from,
                                        @RequestParam(required = false) LocalDate to) {
        return service.timeline(from, to);
    }

    @GetMapping("/segments")
    public Map<String, Object> segments(@RequestParam(required = false) String eventCode) {
        return service.segments(eventCode);
    }

    @GetMapping("/intent")
    public Map<String, Object> intent(@RequestParam(required = false) String eventCode) {
        return service.intent(eventCode);
    }

    @GetMapping("/prizes")
    public Map<String, Object> prizes(@RequestParam(required = false) String eventCode) {
        return service.prizes(eventCode);
    }

    @GetMapping("/monitoring")
    public Map<String, Object> monitoring(@RequestParam(required = false) String eventCode) {
        return service.monitoring(eventCode);
    }

    @GetMapping("/whatap-users")
    public Map<String, Object> whatapUsers(@RequestParam(required = false) String eventCode) {
        return service.whatapUsers(eventCode);
    }

    /**
     * 마케팅 인사이트 — 행사 단위 종합 분석을 LLM 으로 자연어 요약.
     * Ollama 우선, Anthropic 폴백 (어드민 settings 에 API 키 등록 필요).
     */
    @PostMapping("/insights")
    public Map<String, Object> insights(@RequestParam(required = false) String eventCode) {
        Map<String, Long> gradeDist = computeGradeDistribution(eventCode);
        return insightService.generate(eventCode, gradeDist);
    }

    private Map<String, Long> computeGradeDistribution(String eventCode) {
        final UUID eventId;
        if (eventCode != null && !eventCode.isBlank()) {
            Event ev = eventRepository.findByEventCode(eventCode).orElse(null);
            if (ev == null) return Map.of();
            eventId = ev.getId();
        } else {
            eventId = null;
        }
        List<Lead> leads = (eventId == null)
                ? leadRepository.findAll()
                : leadRepository.findAll().stream()
                    .filter(l -> eventId.equals(l.getEventId())).toList();
        Map<String, Long> out = new LinkedHashMap<>();
        out.put("A", 0L); out.put("B", 0L); out.put("C", 0L); out.put("PENDING", 0L);
        for (Lead l : leads) {
            LeadScore s = leadScoreRepository.findByLeadId(l.getId()).orElse(null);
            if (s == null || s.getGrade() == null) out.merge("PENDING", 1L, Long::sum);
            else out.merge(s.getGrade().name(), 1L, Long::sum);
        }
        return out;
    }
}
