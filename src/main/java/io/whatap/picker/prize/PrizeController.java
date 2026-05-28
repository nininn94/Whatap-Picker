package io.whatap.picker.prize;

import io.whatap.picker.common.ApiException;
import io.whatap.picker.common.ErrorCode;
import io.whatap.picker.event.Event;
import io.whatap.picker.event.EventRepository;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/prizes")
public class PrizeController {

    private final PrizeRepository prizeRepository;
    private final EventRepository eventRepository;

    public PrizeController(PrizeRepository prizeRepository, EventRepository eventRepository) {
        this.prizeRepository = prizeRepository;
        this.eventRepository = eventRepository;
    }

    @GetMapping
    public Map<String, Object> list(@RequestParam String eventCode) {
        Event event = eventRepository.findByEventCode(eventCode)
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND));
        List<Prize> prizes = prizeRepository.findByEventIdOrderByRankAsc(event.getId());
        List<Map<String, Object>> mapped = prizes.stream().<Map<String,Object>>map(p -> Map.of(
                "rank", p.getRank(),
                "name", p.getName(),
                "initial", p.getInitialQty(),
                "awarded", p.getInitialQty() - p.getRemainingQty(),
                "remaining", p.getRemainingQty()
        )).toList();
        return Map.of(
                "eventCode", event.getEventCode(),
                "eventDate", (LocalDate) event.getEventDate(),
                "prizes", mapped
        );
    }
}
