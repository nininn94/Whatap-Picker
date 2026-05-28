package io.whatap.picker.admin;

import io.whatap.picker.admin.dto.EventCreateRequest;
import io.whatap.picker.admin.dto.EventUpdateRequest;
import io.whatap.picker.auth.jwt.AppPrincipal;
import io.whatap.picker.common.ApiException;
import io.whatap.picker.common.ErrorCode;
import io.whatap.picker.draw.DrawHistoryRepository;
import io.whatap.picker.event.Event;
import io.whatap.picker.event.EventRepository;
import io.whatap.picker.event.EventStatus;
import io.whatap.picker.form.FormTemplate;
import io.whatap.picker.form.FormTemplateService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/events")
@PreAuthorize("hasRole('ADMIN')")
public class AdminEventController {

    private final EventRepository eventRepository;
    private final FormTemplateService formTemplateService;
    private final DrawHistoryRepository drawHistoryRepository;

    public AdminEventController(EventRepository eventRepository,
                                FormTemplateService formTemplateService,
                                DrawHistoryRepository drawHistoryRepository) {
        this.eventRepository = eventRepository;
        this.formTemplateService = formTemplateService;
        this.drawHistoryRepository = drawHistoryRepository;
    }

    @PostMapping
    public Event create(@Valid @RequestBody EventCreateRequest req,
                        @AuthenticationPrincipal AppPrincipal principal) {
        if (eventRepository.existsByEventCode(req.eventCode())) {
            throw new ApiException(ErrorCode.IN_USE, "이미 사용 중인 event_code 입니다.");
        }
        Event event = new Event(req.eventCode(), req.eventDate(), req.label());
        event.setEndDate(req.endDate());
        event.setStatus(req.status() != null ? req.status() : EventStatus.DRAFT);
        event.setCreatedBy(principal != null ? principal.userId() : null);

        FormTemplate template = req.formTemplateId() != null
                ? formTemplateService.get(req.formTemplateId())
                : formTemplateService.getSystemDefault();
        event.setFormTemplateId(template.getId());

        return eventRepository.save(event);
    }

    @GetMapping
    public List<Event> list() {
        return eventRepository.findAll();
    }

    @GetMapping("/{id}")
    public Event get(@PathVariable UUID id) {
        return eventRepository.findById(id)
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND));
    }

    @PatchMapping("/{id}")
    public Event update(@PathVariable UUID id, @RequestBody EventUpdateRequest req) {
        Event event = eventRepository.findById(id)
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND));
        if (req.label() != null) event.setLabel(req.label());
        if (req.eventDate() != null) event.setEventDate(req.eventDate());
        if (req.endDate() != null) event.setEndDate(req.endDate());
        if (req.status() != null) event.setStatus(req.status());
        return eventRepository.save(event);
    }

    @PutMapping("/{id}/form")
    public Event linkForm(@PathVariable UUID id,
                          @RequestBody Map<String, UUID> body) {
        Event event = eventRepository.findById(id)
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND));
        if (event.isFormLocked()) {
            throw new ApiException(ErrorCode.EVENT_FORM_LOCKED);
        }
        UUID formTemplateId = body.get("formTemplateId");
        if (formTemplateId == null) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "formTemplateId 가 필요합니다.");
        }
        FormTemplate template = formTemplateService.get(formTemplateId);
        event.setFormTemplateId(template.getId());
        return eventRepository.save(event);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable UUID id) {
        Event event = eventRepository.findById(id)
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND));
        if (drawHistoryRepository.countByEventId(event.getId()) > 0) {
            throw new ApiException(ErrorCode.IN_USE, "추첨 이력이 있는 행사는 삭제할 수 없습니다.");
        }
        eventRepository.delete(event);
    }

    @PostMapping("/{id}/regenerate-qr")
    public Map<String, Object> regenerateQr(@PathVariable UUID id) {
        Event event = eventRepository.findById(id)
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND));
        // 캐시된 QR 경로 무효화 — 다음 요청 시 새로 생성
        event.setQrImagePath(null);
        eventRepository.save(event);
        return Map.of(
                "eventCode", event.getEventCode(),
                "qrUrl", "/event/" + event.getEventCode() + "/qr.png"
        );
    }
}
