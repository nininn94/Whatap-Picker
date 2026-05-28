package io.whatap.picker.admin.dashboard;

import io.whatap.picker.csv.CsvWriter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/dashboard/export")
@PreAuthorize("hasRole('ADMIN')")
public class DashboardCsvController {

    private final LeadAnalyticsService service;

    public DashboardCsvController(LeadAnalyticsService service) {
        this.service = service;
    }

    @GetMapping(value = "/summary.csv", produces = "text/csv;charset=UTF-8")
    public ResponseEntity<StreamingResponseBody> summary(@RequestParam(required = false) String eventCode) {
        Map<String, Object> data = service.summary(eventCode);
        StreamingResponseBody body = out -> {
            try (CsvWriter csv = new CsvWriter(out)) {
                csv.writeRow(List.of("이벤트 코드","이벤트 일자","총 리드","추첨","상담 희망",
                        "유효 메일 비율","거부 이메일"));
                csv.writeRow(List.of(
                        s(data.get("eventCode")),
                        s(data.get("eventDate")),
                        s(data.get("leadCount")),
                        s(data.get("drawCount")),
                        s(data.get("wantsConsultationCount")),
                        s(data.get("validEmailRatio")),
                        s(data.get("emailRejectionCount"))
                ));
            }
        };
        return csvResponse(body, "dashboard-summary.csv");
    }

    @GetMapping(value = "/timeline.csv", produces = "text/csv;charset=UTF-8")
    public ResponseEntity<StreamingResponseBody> timeline(@RequestParam(required = false) LocalDate from,
                                                          @RequestParam(required = false) LocalDate to) {
        Map<String, Object> data = service.timeline(from, to);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> series = (List<Map<String, Object>>) data.getOrDefault("series", List.of());
        StreamingResponseBody body = out -> {
            try (CsvWriter csv = new CsvWriter(out)) {
                csv.writeRow(List.of("일자","제출","추첨","상담 희망"));
                for (Map<String, Object> row : series) {
                    csv.writeRow(List.of(s(row.get("date")), s(row.get("submitted")),
                            s(row.get("drawn")), s(row.get("consultations"))));
                }
            }
        };
        return csvResponse(body, "dashboard-timeline.csv");
    }

    @GetMapping(value = "/segments.csv", produces = "text/csv;charset=UTF-8")
    public ResponseEntity<StreamingResponseBody> segments(@RequestParam(required = false) String eventCode) {
        Map<String, Object> data = service.segments(eventCode);
        StreamingResponseBody body = out -> {
            try (CsvWriter csv = new CsvWriter(out)) {
                csv.writeRow(List.of("세그먼트","값","건수"));
                for (var seg : data.entrySet()) {
                    @SuppressWarnings("unchecked")
                    Map<String, Long> buckets = (Map<String, Long>) seg.getValue();
                    for (var e : buckets.entrySet()) {
                        csv.writeRow(List.of(seg.getKey(), e.getKey(), String.valueOf(e.getValue())));
                    }
                }
            }
        };
        return csvResponse(body, "dashboard-segments.csv");
    }

    @GetMapping(value = "/monitoring.csv", produces = "text/csv;charset=UTF-8")
    public ResponseEntity<StreamingResponseBody> monitoring(@RequestParam(required = false) String eventCode) {
        Map<String, Object> data = service.monitoring(eventCode);
        StreamingResponseBody body = out -> {
            try (CsvWriter csv = new CsvWriter(out)) {
                csv.writeRow(List.of("그룹","값","건수"));
                for (var group : data.entrySet()) {
                    @SuppressWarnings("unchecked")
                    Map<String, Long> buckets = (Map<String, Long>) group.getValue();
                    for (var e : buckets.entrySet()) {
                        csv.writeRow(List.of(group.getKey(), e.getKey(), String.valueOf(e.getValue())));
                    }
                }
            }
        };
        return csvResponse(body, "dashboard-monitoring.csv");
    }

    @GetMapping(value = "/intent.csv", produces = "text/csv;charset=UTF-8")
    public ResponseEntity<StreamingResponseBody> intent(@RequestParam(required = false) String eventCode) {
        Map<String, Object> data = service.intent(eventCode);
        StreamingResponseBody body = out -> {
            try (CsvWriter csv = new CsvWriter(out)) {
                csv.writeRow(List.of("그룹","값","건수"));
                for (var group : data.entrySet()) {
                    @SuppressWarnings("unchecked")
                    Map<String, Long> buckets = (Map<String, Long>) group.getValue();
                    for (var e : buckets.entrySet()) {
                        csv.writeRow(List.of(group.getKey(), e.getKey(), String.valueOf(e.getValue())));
                    }
                }
            }
        };
        return csvResponse(body, "dashboard-intent.csv");
    }

    private static ResponseEntity<StreamingResponseBody> csvResponse(StreamingResponseBody body, String filename) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
                .body(body);
    }

    private static String s(Object o) { return o == null ? "" : o.toString(); }
}
