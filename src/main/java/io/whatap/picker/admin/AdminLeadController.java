package io.whatap.picker.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
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
    private final ObjectMapper objectMapper;

    public AdminLeadController(LeadRepository leadRepository,
                               EventRepository eventRepository,
                               DrawHistoryRepository drawHistoryRepository,
                               LeadScoreRepository leadScoreRepository,
                               ObjectMapper objectMapper) {
        this.leadRepository = leadRepository;
        this.eventRepository = eventRepository;
        this.drawHistoryRepository = drawHistoryRepository;
        this.leadScoreRepository = leadScoreRepository;
        this.objectMapper = objectMapper;
    }

    @GetMapping
    public Map<String, Object> list(@RequestParam(required = false) String eventCode,
                                    @RequestParam(required = false) Industry industry,
                                    @RequestParam(required = false) JobLevel jobLevel,
                                    @RequestParam(required = false) MonitoringStatus monitoringStatus,
                                    @RequestParam(required = false) PlanWithinYear planWithinYear,
                                    @RequestParam(required = false) Grade grade,
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
                LeadSpecifications.jobLevel(jobLevel),
                LeadSpecifications.monitoringStatus(monitoringStatus),
                LeadSpecifications.planWithinYear(planWithinYear)
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
        // Map.of 는 null value 불가 — null 가능 필드는 HashMap 사용
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
        m.put("monitoringStatus", l.getMonitoringStatus());
        m.put("planWithinYear", l.getPlanWithinYear());
        m.put("consultationPreference", l.getConsultationPreference());
        m.put("interestProducts", l.getInterestProducts());
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
