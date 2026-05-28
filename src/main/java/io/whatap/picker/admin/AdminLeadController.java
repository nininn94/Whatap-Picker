package io.whatap.picker.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.whatap.picker.admin.dashboard.MarketingInsightService;
import io.whatap.picker.ai.LeadScoreRepository;
import io.whatap.picker.ai.enums.Grade;
import io.whatap.picker.csv.CsvWriter;
import io.whatap.picker.draw.DrawHistory;
import io.whatap.picker.draw.DrawHistoryRepository;
import io.whatap.picker.event.Event;
import io.whatap.picker.event.EventRepository;
import io.whatap.picker.lead.Lead;
import io.whatap.picker.lead.LeadRepository;
import io.whatap.picker.lead.LeadSpecifications;
import io.whatap.picker.lead.enums.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin/leads")
@PreAuthorize("hasRole('ADMIN')")
public class AdminLeadController {

    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_OFFSET_DATE_TIME;

    private final LeadRepository leadRepository;
    private final EventRepository eventRepository;
    private final DrawHistoryRepository drawHistoryRepository;
    private final LeadScoreRepository leadScoreRepository;
    private final MarketingInsightService insightService;
    private final ObjectMapper objectMapper;

    public AdminLeadController(LeadRepository leadRepository,
                               EventRepository eventRepository,
                               DrawHistoryRepository drawHistoryRepository,
                               LeadScoreRepository leadScoreRepository,
                               MarketingInsightService insightService,
                               ObjectMapper objectMapper) {
        this.leadRepository = leadRepository;
        this.eventRepository = eventRepository;
        this.drawHistoryRepository = drawHistoryRepository;
        this.leadScoreRepository = leadScoreRepository;
        this.insightService = insightService;
        this.objectMapper = objectMapper;
    }

    @GetMapping
    public Map<String, Object> list(@RequestParam(required = false) String eventCode,
                                    @RequestParam(required = false) Industry industry,
                                    @RequestParam(required = false) JobFunction jobFunction,
                                    @RequestParam(required = false) JobLevel jobLevel,
                                    @RequestParam(required = false) CompanySize companySize,
                                    @RequestParam(required = false) EmployeeCountRange employeeCountRange,
                                    @RequestParam(required = false) MonitoringStatus monitoringStatus,
                                    @RequestParam(required = false) PlanWithinYear planWithinYear,
                                    @RequestParam(required = false) ConsultationPreference consultationPreference,
                                    @RequestParam(required = false) AdoptionBlocker adoptionBlocker,
                                    @RequestParam(required = false) Grade grade,
                                    @RequestParam(required = false) String q,
                                    @RequestParam(defaultValue = "0") int page,
                                    @RequestParam(defaultValue = "50") int size) {

        UUID eventId = null;
        if (eventCode != null && !eventCode.isBlank()) {
            Event event = eventRepository.findByEventCode(eventCode).orElse(null);
            if (event == null) return Map.of("content", List.of(), "totalElements", 0L);
            eventId = event.getId();
        }

        Specification<Lead> spec = Specification.allOf(
                LeadSpecifications.eventId(eventId),
                LeadSpecifications.industry(industry),
                LeadSpecifications.jobFunction(jobFunction),
                LeadSpecifications.jobLevel(jobLevel),
                LeadSpecifications.companySize(companySize),
                LeadSpecifications.employeeCountRange(employeeCountRange),
                LeadSpecifications.monitoringStatus(monitoringStatus),
                LeadSpecifications.planWithinYear(planWithinYear),
                LeadSpecifications.consultationPreference(consultationPreference),
                LeadSpecifications.adoptionBlocker(adoptionBlocker),
                LeadSpecifications.keyword(q)
        );
        Page<Lead> result = leadRepository.findAll(spec, PageRequest.of(page, size));

        List<Map<String, Object>> rows = result.getContent().stream().<Map<String,Object>>map(l -> {
            Map<String, Object> row = new java.util.HashMap<>(toListView(l));
            leadScoreRepository.findByLeadId(l.getId()).ifPresent(s -> {
                row.put("aiStatus", s.getAiStatus());
                row.put("grade", s.getGrade());
                row.put("score", s.getScore());
            });
            return row;
        }).filter(row -> {
            if (grade == null) return true;
            return grade.equals(row.get("grade"));
        }).toList();

        return Map.of(
                "content", rows,
                "totalElements", result.getTotalElements(),
                "totalPages", result.getTotalPages(),
                "page", result.getNumber(),
                "size", result.getSize()
        );
    }

    @GetMapping("/{id}")
    public Map<String, Object> detail(@PathVariable UUID id) {
        Lead lead = leadRepository.findById(id).orElseThrow(() ->
                new io.whatap.picker.common.ApiException(
                        io.whatap.picker.common.ErrorCode.NOT_FOUND, "리드를 찾을 수 없습니다."));
        Map<String, Object> view = new java.util.HashMap<>();
        view.put("id", lead.getId());
        view.put("eventId", lead.getEventId());
        view.put("name", lead.getLastName() + lead.getFirstName());
        view.put("phone", lead.getPhone());
        view.put("email", lead.getEmail());
        view.put("company", lead.getCompany());
        view.put("industry", lead.getIndustry());
        view.put("jobFunction", lead.getJobFunction());
        view.put("jobLevel", lead.getJobLevel());
        view.put("companySize", lead.getCompanySize());
        view.put("monitoringStatus", lead.getMonitoringStatus());
        view.put("interestProducts", lead.getInterestProducts());
        view.put("planWithinYear", lead.getPlanWithinYear());
        view.put("consultationPreference", lead.getConsultationPreference());
        view.put("surveyPayload", lead.getSurveyPayload());
        view.put("createdAt", lead.getCreatedAt());
        view.put("retentionUntil", lead.getRetentionUntil());
        view.put("draw", drawHistoryRepository.findByLeadIdAndEventId(lead.getId(), lead.getEventId())
                .map(h -> Map.of(
                        "awardedRank", h.getAwardedRank(),
                        "drawnAt", h.getDrawnAt()))
                .orElse(null));
        return view;
    }

    /**
     * 현재 보고 있는 필터된 결과에 대한 AI 인사이트.
     * Body로 list() 응답(총건수+세그먼트 집계)을 그대로 받아 LLM 에 전달.
     * LLM 사용 불가 시 RuntimeException → 400.
     */
    @PostMapping("/insights")
    public Map<String, Object> insightsForFilter(@RequestBody InsightRequest req) {
        java.util.LinkedHashMap<String, Object> stats = new java.util.LinkedHashMap<>();
        if (req.filters != null) stats.put("적용 필터", req.filters);
        stats.put("총 리드 수", req.totalElements);
        if (req.gradeDistribution != null && !req.gradeDistribution.isEmpty())
            stats.put("Lifecycle Stage 분포", req.gradeDistribution);
        if (req.segmentCounts != null) req.segmentCounts.forEach(stats::put);
        return insightService.generateForFiltered(
                req.label == null ? "필터된 리드" : req.label, stats);
    }

    public static class InsightRequest {
        public String label;
        public Map<String, Object> filters;
        public Long totalElements;
        public Map<String, Long> gradeDistribution;
        public Map<String, Map<String, Long>> segmentCounts;
    }

    @DeleteMapping("/expired")
    public Map<String, Object> deleteExpired() {
        List<Lead> expired = leadRepository.findByRetentionUntilBefore(LocalDate.now());
        int count = expired.size();
        leadRepository.deleteAll(expired);
        return Map.of("deleted", count);
    }

    @GetMapping(value = "/export.csv", produces = "text/csv;charset=UTF-8")
    public ResponseEntity<StreamingResponseBody> exportCsv(
            @RequestParam(required = false) String eventCode) {

        Event filterEvent = (eventCode != null && !eventCode.isBlank())
                ? eventRepository.findByEventCode(eventCode).orElse(null)
                : null;

        StreamingResponseBody body = out -> {
            try (CsvWriter csv = new CsvWriter(out)) {
                csv.writeRow(HEADERS);
                List<Lead> leads = filterEvent != null
                        ? leadRepository.findAll().stream()
                            .filter(l -> l.getEventId().equals(filterEvent.getId()))
                            .toList()
                        : leadRepository.findAll();

                for (Lead lead : leads) {
                    Event ev = eventRepository.findById(lead.getEventId()).orElse(null);
                    DrawHistory draw = drawHistoryRepository
                            .findByLeadIdAndEventId(lead.getId(), lead.getEventId()).orElse(null);
                    csv.writeRow(buildRow(lead, ev, draw));
                }
                csv.flush();
            }
        };

        String filename = "leads_" + OffsetDateTime.now().toLocalDate() + ".csv";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
                .body(body);
    }

    // ----------------------------------------------------------------
    // CSV helpers
    // ----------------------------------------------------------------
    private static final List<String> HEADERS = List.of(
            "이벤트 코드","이벤트 일자",
            "리드 ID","성","이름","회사명","회사 이메일","휴대폰",
            "산업군","직무","직급","기업 규모","직원 수","현재 모니터링 상태",
            "관심 제품","망설이는 이유","1년내 계획","미팅 희망",
            "개인정보 동의 시각","마케팅 동의 시각","보존 만료일",
            "추첨 등수","추첨 시각",
            "제출 시각"
    );

    private List<String> buildRow(Lead l, Event ev, DrawHistory d) {
        List<String> row = new ArrayList<>();
        row.add(ev != null ? ev.getEventCode() : "");
        row.add(ev != null ? ev.getEventDate().toString() : "");
        row.add(l.getId().toString());
        row.add(l.getLastName());
        row.add(l.getFirstName());
        row.add(safe(l.getCompany()));
        row.add(l.getEmail());
        row.add(l.getPhone());
        row.add(label(l.getIndustry()));
        row.add(label(l.getJobFunction()));
        row.add(label(l.getJobLevel()));
        row.add(label(l.getCompanySize()));
        row.add(label(l.getEmployeeCountRange()));
        row.add(label(l.getMonitoringStatus()));
        row.add(l.getInterestProducts() == null ? ""
                : l.getInterestProducts().stream()
                    .map(io.whatap.picker.lead.enums.InterestProduct::label)
                    .collect(Collectors.joining(", ")));
        row.add(label(l.getAdoptionBlocker()));
        row.add(label(l.getPlanWithinYear()));
        row.add(label(l.getConsultationPreference()));
        row.add(formatTs(l.getPrivacyConsentAt()));
        row.add(formatTs(l.getMarketingConsentAt()));
        row.add(l.getRetentionUntil() != null ? l.getRetentionUntil().toString() : "");
        row.add(d != null && d.getAwardedRank() != null ? d.getAwardedRank().toString() : (d != null ? "꽝" : ""));
        row.add(d != null ? formatTs(d.getDrawnAt()) : "");
        row.add(formatTs(l.getCreatedAt()));
        return row;
    }

    private Map<String, Object> toListView(Lead l) {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("id", l.getId());
        m.put("eventId", l.getEventId());
        m.put("name", l.getLastName() + l.getFirstName());
        m.put("phone", l.getPhone());
        m.put("email", l.getEmail());
        m.put("company", l.getCompany() == null ? "" : l.getCompany());
        m.put("industry", l.getIndustry());
        m.put("jobFunction", l.getJobFunction());
        m.put("jobLevel", l.getJobLevel());
        m.put("companySize", l.getCompanySize());
        m.put("employeeCountRange", l.getEmployeeCountRange());
        m.put("monitoringStatus", l.getMonitoringStatus());
        m.put("adoptionBlocker", l.getAdoptionBlocker());
        m.put("planWithinYear", l.getPlanWithinYear());
        m.put("consultationPreference", l.getConsultationPreference());
        m.put("interestProducts", l.getInterestProducts());

        // surveyPayload 핵심 필드 평탄화 — 화면 컬럼/필터에 직접 사용 가능하도록
        var payload = l.getSurveyPayload();
        if (payload != null) {
            if (payload.whatap() != null) {
                m.put("whatapProficiency", payload.whatap().proficiency());
                m.put("whatapNeededHelps", payload.whatap().neededHelps());
            }
            if (payload.other() != null) {
                m.put("commercialProducts", payload.other().commercialProducts());
                m.put("openSourceProducts", payload.other().openSourceProducts());
                if (payload.other().commercial() != null) {
                    var c = payload.other().commercial();
                    m.put("commercialDeployment",   c.deployment());
                    m.put("commercialSatisfaction", c.satisfaction());
                    m.put("commercialComplaints",   c.complaints());
                    m.put("annualBudget",           c.annualBudget());
                    m.put("costPerception",         c.costPerception());
                    m.put("switchReason",           c.switchReason());
                }
                if (payload.other().openSource() != null) {
                    var o = payload.other().openSource();
                    m.put("openSourceDeployment",   o.deployment());
                    m.put("openSourceSatisfaction", o.satisfaction());
                    m.put("openSourceDifficulties", o.difficulties());
                }
            }
            if (payload.notUsing() != null) {
                m.put("notUsingConcerns",       payload.notUsing().concerns());
                m.put("notUsingFrequentIssues", payload.notUsing().frequentIssues());
            }
        }

        m.put("createdAt", l.getCreatedAt());
        m.put("retentionUntil", l.getRetentionUntil());
        return m;
    }

    private static String label(Enum<?> e) {
        if (e == null) return "";
        try {
            return (String) e.getClass().getMethod("label").invoke(e);
        } catch (Exception ex) {
            return e.name();
        }
    }

    private static String safe(String s) { return s == null ? "" : s; }
    private static String formatTs(OffsetDateTime t) { return t == null ? "" : t.format(ISO); }
}
