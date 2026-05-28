package io.whatap.picker.admin;

import io.whatap.picker.common.ApiException;
import io.whatap.picker.common.ErrorCode;
import io.whatap.picker.csv.CsvWriter;
import io.whatap.picker.draw.DrawHistory;
import io.whatap.picker.draw.DrawHistoryRepository;
import io.whatap.picker.event.Event;
import io.whatap.picker.event.EventRepository;
import io.whatap.picker.lead.Lead;
import io.whatap.picker.lead.LeadRepository;
import io.whatap.picker.prize.Prize;
import io.whatap.picker.prize.PrizeRepository;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@PreAuthorize("hasRole('ADMIN')")
public class AdminWinnerController {

    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_OFFSET_DATE_TIME;

    private final DrawHistoryRepository drawHistoryRepository;
    private final LeadRepository leadRepository;
    private final PrizeRepository prizeRepository;
    private final EventRepository eventRepository;

    public AdminWinnerController(DrawHistoryRepository drawHistoryRepository,
                                 LeadRepository leadRepository,
                                 PrizeRepository prizeRepository,
                                 EventRepository eventRepository) {
        this.drawHistoryRepository = drawHistoryRepository;
        this.leadRepository = leadRepository;
        this.prizeRepository = prizeRepository;
        this.eventRepository = eventRepository;
    }

    /**
     * 행사별 당첨자 목록 (DrawHistory + Lead + Prize 묶음).
     * 기획서: 누가 몇 등 상품 가져갔는지 즉시 확인.
     */
    @GetMapping("/api/admin/draw/winners")
    public List<Map<String, Object>> list(@RequestParam String eventCode) {
        Event event = eventRepository.findByEventCode(eventCode)
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND));

        // Prize id → name 매핑
        Map<UUID, String> prizeNames = new HashMap<>();
        for (Prize p : prizeRepository.findByEventIdOrderByRankAsc(event.getId())) {
            prizeNames.put(p.getId(), p.getName());
        }

        return drawHistoryRepository.findAll().stream()
                .filter(h -> h.getEventId().equals(event.getId()))
                .sorted(Comparator
                        .comparing((DrawHistory h) -> h.getAwardedRank() == null ? Short.MAX_VALUE : h.getAwardedRank())
                        .thenComparing(DrawHistory::getDrawnAt))
                .<Map<String, Object>>map(h -> {
                    Map<String, Object> row = new HashMap<>();
                    row.put("drawHistoryId", h.getId());
                    row.put("leadId", h.getLeadId());
                    row.put("awardedRank", h.getAwardedRank());
                    row.put("prizeId", h.getPrizeId());
                    row.put("prizeName", h.getPrizeId() == null ? null : prizeNames.get(h.getPrizeId()));
                    row.put("outOfStock", h.getAwardedRank() == null);
                    row.put("drawnAt", h.getDrawnAt());

                    if (h.getLeadId() != null) {
                        leadRepository.findById(h.getLeadId()).ifPresent(l -> {
                            row.put("name", l.getLastName() + l.getFirstName());
                            row.put("phone", l.getPhone());
                            row.put("phoneLast4", l.getPhoneLast4());
                            row.put("company", l.getCompany());
                            row.put("email", l.getEmail());
                            row.put("jobLevel", l.getJobLevel());
                        });
                    } else {
                        row.put("name", "(파기됨)");
                    }
                    return row;
                })
                .toList();
    }

    @GetMapping(value = "/api/admin/draw/winners.csv", produces = "text/csv;charset=UTF-8")
    public ResponseEntity<StreamingResponseBody> exportCsv(@RequestParam String eventCode) {
        List<Map<String, Object>> winners = list(eventCode);

        StreamingResponseBody body = out -> {
            try (CsvWriter csv = new CsvWriter(out)) {
                csv.writeRow(List.of("등수","경품명","이름","회사","휴대폰","휴대폰 뒷4","이메일","직급","추첨 시각"));
                for (Map<String, Object> w : winners) {
                    csv.writeRow(List.of(
                            w.get("awardedRank") == null ? "꽝" : w.get("awardedRank").toString(),
                            s(w.get("prizeName")),
                            s(w.get("name")),
                            s(w.get("company")),
                            s(w.get("phone")),
                            s(w.get("phoneLast4")),
                            s(w.get("email")),
                            s(w.get("jobLevel")),
                            w.get("drawnAt") == null ? "" : ((OffsetDateTime) w.get("drawnAt")).format(ISO)
                    ));
                }
            }
        };

        String filename = "winners_" + eventCode + ".csv";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
                .body(body);
    }

    private static String s(Object o) { return o == null ? "" : o.toString(); }
}
