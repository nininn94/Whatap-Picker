package io.whatap.picker.draw;

import io.whatap.picker.auth.jwt.AppPrincipal;
import io.whatap.picker.common.ApiException;
import io.whatap.picker.common.ErrorCode;
import io.whatap.picker.draw.dto.DrawRequest;
import io.whatap.picker.draw.dto.DrawResponse;
import io.whatap.picker.event.Event;
import io.whatap.picker.event.EventRepository;
import io.whatap.picker.lead.Lead;
import io.whatap.picker.lead.LeadRepository;
import io.whatap.picker.prize.Prize;
import io.whatap.picker.prize.PrizeRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class DrawService {

    private final LeadRepository leadRepository;
    private final EventRepository eventRepository;
    private final PrizeRepository prizeRepository;
    private final DrawHistoryRepository drawHistoryRepository;
    private final SecureRandom random = new SecureRandom();

    public DrawService(LeadRepository leadRepository,
                       EventRepository eventRepository,
                       PrizeRepository prizeRepository,
                       DrawHistoryRepository drawHistoryRepository) {
        this.leadRepository = leadRepository;
        this.eventRepository = eventRepository;
        this.prizeRepository = prizeRepository;
        this.drawHistoryRepository = drawHistoryRepository;
    }

    @Transactional
    public DrawResponse draw(DrawRequest request, AppPrincipal operator) {
        Lead lead = leadRepository.findById(request.leadId())
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "참여자를 찾을 수 없습니다."));

        Event event = eventRepository.findByEventCode(request.eventCode())
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND));

        if (!lead.getEventId().equals(event.getId())) {
            throw new ApiException(ErrorCode.NOT_FOUND, "해당 행사 참여자가 아닙니다.");
        }

        Optional<DrawHistory> existing =
                drawHistoryRepository.findByLeadIdAndEventId(lead.getId(), event.getId());
        if (existing.isPresent()) {
            throw new ApiException(ErrorCode.ALREADY_DRAWN);
        }

        List<Prize> prizes = prizeRepository.findRemainingForUpdate(event.getId());
        int total = prizes.stream().mapToInt(Prize::getRemainingQty).sum();

        Prize selected = null;
        Short awardedRank = null;
        if (total > 0) {
            int roll = random.nextInt(total);
            int cumulative = 0;
            for (Prize p : prizes) {
                cumulative += p.getRemainingQty();
                if (roll < cumulative) {
                    selected = p;
                    awardedRank = p.getRank();
                    break;
                }
            }
        }

        if (selected != null) {
            selected.setRemainingQty(selected.getRemainingQty() - 1);
            prizeRepository.save(selected);
        }

        DrawHistory history = new DrawHistory(
                lead.getId(),
                event.getId(),
                selected != null ? selected.getId() : null,
                awardedRank,
                operator != null ? operator.userId() : null
        );

        try {
            drawHistoryRepository.saveAndFlush(history);
        } catch (DataIntegrityViolationException e) {
            // UNIQUE 제약 충돌 → 동시 호출에서 1건만 성공
            throw new ApiException(ErrorCode.ALREADY_DRAWN);
        }

        boolean outOfStock = (selected == null);
        return new DrawResponse(
                outOfStock ? null : selected.getRank(),
                outOfStock ? null : selected.getName(),
                outOfStock,
                history.getDrawnAt(),
                operator != null
                        ? new DrawResponse.OperatorRef(operator.userId(), operator.username())
                        : null
        );
    }
}
