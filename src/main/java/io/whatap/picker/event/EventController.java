package io.whatap.picker.event;

import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 비인증 공개 행사 목록 API.
 * 프론트가 행사 선택 드롭다운 등에 사용. OPEN 상태만 노출.
 */
@RestController
@RequestMapping("/api/events")
public class EventController {

    private final EventRepository eventRepository;

    public EventController(EventRepository eventRepository) {
        this.eventRepository = eventRepository;
    }

    @GetMapping
    public List<Map<String, Object>> listOpen(
            @RequestParam(name = "status", required = false) EventStatus status) {

        EventStatus filter = status != null ? status : EventStatus.OPEN;
        return eventRepository.findByStatusOrderByEventDateDesc(filter).stream()
                .<Map<String, Object>>map(e -> {
                    Map<String, Object> m = new java.util.LinkedHashMap<>();
                    m.put("eventCode", e.getEventCode());
                    m.put("label", e.getLabel());
                    m.put("eventDate", (LocalDate) e.getEventDate());
                    m.put("endDate", e.getEndDate());
                    m.put("status", e.getStatus());
                    return m;
                })
                .toList();
    }
}
