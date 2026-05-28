package io.whatap.picker.draw;

import io.whatap.picker.auth.jwt.AppPrincipal;
import io.whatap.picker.common.ApiException;
import io.whatap.picker.common.ErrorCode;
import io.whatap.picker.draw.dto.DrawRequest;
import io.whatap.picker.draw.dto.DrawResponse;
import io.whatap.picker.event.Event;
import io.whatap.picker.event.EventRepository;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/draw")
@PreAuthorize("hasAnyRole('OPERATOR','ADMIN')")
public class DrawController {

    private final DrawService drawService;
    private final DrawHistoryRepository historyRepository;
    private final EventRepository eventRepository;

    public DrawController(DrawService drawService,
                          DrawHistoryRepository historyRepository,
                          EventRepository eventRepository) {
        this.drawService = drawService;
        this.historyRepository = historyRepository;
        this.eventRepository = eventRepository;
    }

    @PostMapping
    public DrawResponse draw(@Valid @RequestBody DrawRequest req,
                             @AuthenticationPrincipal AppPrincipal principal) {
        return drawService.draw(req, principal);
    }

    @GetMapping("/history")
    public Map<String, Object> history(@RequestParam UUID leadId,
                                       @RequestParam String eventCode) {
        Event event = eventRepository.findByEventCode(eventCode)
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND));
        return historyRepository.findByLeadIdAndEventId(leadId, event.getId())
                .map(h -> Map.<String,Object>of(
                        "drawn", true,
                        "drawnAt", h.getDrawnAt(),
                        "awardedRank", h.getAwardedRank(),
                        "prizeId", h.getPrizeId()))
                .orElse(Map.of("drawn", false));
    }
}
