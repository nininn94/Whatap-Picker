package io.whatap.picker.admin;

import io.whatap.picker.admin.dto.PrizeBulkRequest;
import io.whatap.picker.admin.dto.PrizeUpdateRequest;
import io.whatap.picker.common.ApiException;
import io.whatap.picker.common.ErrorCode;
import io.whatap.picker.draw.DrawHistoryRepository;
import io.whatap.picker.event.Event;
import io.whatap.picker.event.EventRepository;
import io.whatap.picker.prize.Prize;
import io.whatap.picker.prize.PrizeRepository;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@PreAuthorize("hasRole('ADMIN')")
public class AdminPrizeController {

    private final EventRepository eventRepository;
    private final PrizeRepository prizeRepository;
    private final DrawHistoryRepository drawHistoryRepository;

    public AdminPrizeController(EventRepository eventRepository,
                                PrizeRepository prizeRepository,
                                DrawHistoryRepository drawHistoryRepository) {
        this.eventRepository = eventRepository;
        this.prizeRepository = prizeRepository;
        this.drawHistoryRepository = drawHistoryRepository;
    }

    @PostMapping("/api/admin/events/{eventId}/prizes")
    @Transactional
    public List<Prize> bulkUpsert(@PathVariable UUID eventId,
                                  @Valid @RequestBody PrizeBulkRequest req) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND));
        List<Prize> existing = prizeRepository.findByEventIdOrderByRankAsc(event.getId());

        for (PrizeBulkRequest.Item item : req.prizes()) {
            Prize p = existing.stream()
                    .filter(e -> e.getRank().equals(item.rank()))
                    .findFirst()
                    .orElse(null);
            if (p == null) {
                p = new Prize(event.getId(), item.rank(), item.name(), item.initialQty());
            } else {
                int awarded = p.getInitialQty() - p.getRemainingQty();
                if (item.initialQty() < awarded) {
                    throw new ApiException(ErrorCode.VALIDATION_FAILED,
                            "초기 수량은 이미 차감된 양(%d개)보다 작을 수 없습니다.".formatted(awarded));
                }
                p.setName(item.name());
                int delta = item.initialQty() - p.getInitialQty();
                p.setInitialQty(item.initialQty());
                p.setRemainingQty(p.getRemainingQty() + delta);
            }
            prizeRepository.save(p);
        }
        return prizeRepository.findByEventIdOrderByRankAsc(event.getId());
    }

    @PatchMapping("/api/admin/prizes/{prizeId}")
    @Transactional
    public Prize update(@PathVariable UUID prizeId, @RequestBody PrizeUpdateRequest req) {
        Prize p = prizeRepository.findById(prizeId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "경품을 찾을 수 없습니다."));
        if (req.name() != null) p.setName(req.name());
        if (req.initialQty() != null) {
            int awarded = p.getInitialQty() - p.getRemainingQty();
            if (req.initialQty() < awarded) {
                throw new ApiException(ErrorCode.VALIDATION_FAILED,
                        "초기 수량은 이미 차감된 양(%d개)보다 작을 수 없습니다.".formatted(awarded));
            }
            int delta = req.initialQty() - p.getInitialQty();
            p.setInitialQty(req.initialQty());
            p.setRemainingQty(p.getRemainingQty() + delta);
        }
        return prizeRepository.save(p);
    }

    @DeleteMapping("/api/admin/prizes/{prizeId}")
    @Transactional
    public void delete(@PathVariable UUID prizeId) {
        Prize p = prizeRepository.findById(prizeId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "경품을 찾을 수 없습니다."));
        // 추첨 이력이 이 경품을 가리키면 거부
        long awarded = p.getInitialQty() - p.getRemainingQty();
        if (awarded > 0) {
            throw new ApiException(ErrorCode.IN_USE, "이미 당첨된 이력이 있는 경품은 삭제할 수 없습니다.");
        }
        prizeRepository.delete(p);
    }
}
