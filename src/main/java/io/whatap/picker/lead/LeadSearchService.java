package io.whatap.picker.lead;

import io.whatap.picker.common.ApiException;
import io.whatap.picker.common.ErrorCode;
import io.whatap.picker.draw.DrawHistory;
import io.whatap.picker.draw.DrawHistoryRepository;
import io.whatap.picker.event.Event;
import io.whatap.picker.event.EventRepository;
import io.whatap.picker.lead.dto.LeadSearchResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
public class LeadSearchService {

    private final LeadRepository leadRepository;
    private final EventRepository eventRepository;
    private final DrawHistoryRepository drawHistoryRepository;

    public LeadSearchService(LeadRepository leadRepository,
                             EventRepository eventRepository,
                             DrawHistoryRepository drawHistoryRepository) {
        this.leadRepository = leadRepository;
        this.eventRepository = eventRepository;
        this.drawHistoryRepository = drawHistoryRepository;
    }

    @Transactional(readOnly = true)
    public LeadSearchResponse search(String name, String phoneLast4, String eventCode) {
        if (name == null || name.isBlank()) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "이름이 필요합니다.");
        }
        if (phoneLast4 == null || !phoneLast4.matches("\\d{4}")) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "휴대폰 뒷자리 4자리가 필요합니다.");
        }
        Event event = eventRepository.findByEventCode(eventCode)
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND));

        String normalizedName = name.replaceAll("\\s", "");
        List<Lead> leads = leadRepository.findByEventIdAndFullNameAndPhoneLast4(
                event.getId(), normalizedName, phoneLast4);

        List<LeadSearchResponse.Item> items = leads.stream().map(lead -> {
            Optional<DrawHistory> history = drawHistoryRepository
                    .findByLeadIdAndEventId(lead.getId(), event.getId());
            return new LeadSearchResponse.Item(
                    lead.getId(),
                    lead.getLastName() + lead.getFirstName(),
                    lead.getJobFunction(),
                    lead.getJobLevel(),
                    lead.getCompany(),
                    history.isPresent(),
                    history.map(DrawHistory::getDrawnAt).orElse(null),
                    null // Phase 8에서 LeadScore lookup 채움
            );
        }).toList();

        return new LeadSearchResponse(event.getEventCode(), event.getEventDate(), items);
    }
}
