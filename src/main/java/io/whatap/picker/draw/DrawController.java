package io.whatap.picker.draw;

import io.whatap.picker.auth.jwt.AppPrincipal;
import io.whatap.picker.draw.dto.DrawRequest;
import io.whatap.picker.draw.dto.DrawResponse;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/draw")
@PreAuthorize("hasAnyRole('OPERATOR','ADMIN')")
public class DrawController {

    private final DrawService drawService;
    private final DrawHistoryRepository historyRepository;

    public DrawController(DrawService drawService, DrawHistoryRepository historyRepository) {
        this.drawService = drawService;
        this.historyRepository = historyRepository;
    }

    @PostMapping
    public DrawResponse draw(@Valid @RequestBody DrawRequest req,
                             @AuthenticationPrincipal AppPrincipal principal) {
        return drawService.draw(req, principal);
    }

    @GetMapping("/history")
    public Map<String, Object> history(@RequestParam UUID leadId, @RequestParam UUID eventId) {
        return historyRepository.findByLeadIdAndEventId(leadId, eventId)
                .map(h -> Map.<String,Object>of(
                        "drawnAt", (OffsetDateTime) h.getDrawnAt(),
                        "awardedRank", h.getAwardedRank(),
                        "prizeId", h.getPrizeId(),
                        "drawn", true))
                .orElse(Map.of("drawn", false));
    }
}
