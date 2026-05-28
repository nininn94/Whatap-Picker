package io.whatap.picker.lead;

import io.whatap.picker.ai.LeadScore;
import io.whatap.picker.ai.LeadScoreRepository;
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
    private final LeadScoreRepository leadScoreRepository;

    public LeadSearchService(LeadRepository leadRepository,
                             EventRepository eventRepository,
                             DrawHistoryRepository drawHistoryRepository,
                             LeadScoreRepository leadScoreRepository) {
        this.leadRepository = leadRepository;
        this.eventRepository = eventRepository;
        this.drawHistoryRepository = drawHistoryRepository;
        this.leadScoreRepository = leadScoreRepository;
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
        // 1차: full_name 정확 일치 (가장 빠름)
        List<Lead> leads = leadRepository.findByEventIdAndFullNameAndPhoneLast4(
                event.getId(), normalizedName, phoneLast4);
        // 2차: 부분 일치(대소문자 무시) 폴백 — "김관진" 의 일부("김") 입력만으로도 검색되도록
        if (leads.isEmpty()) {
            leads = leadRepository.searchByNameLike(event.getId(), normalizedName, phoneLast4);
        }

        List<LeadSearchResponse.Item> items = leads.stream().map(lead -> {
            Optional<DrawHistory> history = drawHistoryRepository
                    .findByLeadIdAndEventId(lead.getId(), event.getId());
            LeadSearchResponse.AiStatusInfo ai = leadScoreRepository.findByLeadId(lead.getId())
                    .map(s -> new LeadSearchResponse.AiStatusInfo(
                            s.getAiStatus().name(),
                            s.getGrade() == null ? null : s.getGrade().name(),
                            s.getScore() == null ? null : s.getScore().intValue()))
                    .orElse(new LeadSearchResponse.AiStatusInfo("PENDING", null, null));
            return new LeadSearchResponse.Item(
                    lead.getId(),
                    lead.getLastName() + lead.getFirstName(),
                    lead.getJobFunction(),
                    lead.getJobLevel(),
                    lead.getCompany(),
                    history.isPresent(),
                    history.map(DrawHistory::getDrawnAt).orElse(null),
                    ai
            );
        }).toList();

        return new LeadSearchResponse(event.getEventCode(), event.getEventDate(), items);
    }
}
