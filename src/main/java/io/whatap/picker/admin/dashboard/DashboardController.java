package io.whatap.picker.admin.dashboard;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/dashboard")
@PreAuthorize("hasRole('ADMIN')")
public class DashboardController {

    private final LeadAnalyticsService service;

    public DashboardController(LeadAnalyticsService service) {
        this.service = service;
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
}
