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
import io.whatap.picker.lead.Lead;
import io.whatap.picker.lead.LeadRepository;
import io.whatap.picker.sheets.SheetsSyncService;
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
    private final SheetsSyncService sheetsSyncService;
    private final LeadRepository leadRepository;

    public AdminEventController(EventRepository eventRepository,
                                FormTemplateService formTemplateService,
                                DrawHistoryRepository drawHistoryRepository,
                                SheetsSyncService sheetsSyncService,
                                LeadRepository leadRepository) {
        this.eventRepository = eventRepository;
        this.formTemplateService = formTemplateService;
        this.drawHistoryRepository = drawHistoryRepository;
        this.sheetsSyncService = sheetsSyncService;
        this.leadRepository = leadRepository;
    }

    @PostMapping
    public Event create(@Valid @RequestBody EventCreateRequest req,
                        @AuthenticationPrincipal AppPrincipal principal) {
        String eventCode;
        if (req.eventCode() == null || req.eventCode().isBlank()) {
            eventCode = generateUniqueEventCode();
        } else {
            if (eventRepository.existsByEventCode(req.eventCode())) {
                throw new ApiException(ErrorCode.IN_USE, "이미 사용 중인 event_code 입니다.");
            }
            eventCode = req.eventCode();
        }

        Event event = new Event(eventCode, req.eventDate(), req.label());
        event.setEndDate(req.endDate());
        event.setStatus(req.status() != null ? req.status() : EventStatus.DRAFT);
        event.setCreatedBy(principal != null ? principal.userId() : null);

        FormTemplate template = req.formTemplateId() != null
                ? formTemplateService.get(req.formTemplateId())
                : formTemplateService.getSystemDefault();
        event.setFormTemplateId(template.getId());

        return eventRepository.save(event);
    }

    /** Crockford-like base32 (0/o, 1/l/i 제외) 6자 + "evt-" prefix. 약 7.5억 조합. */
    private static final char[] ALPHABET =
            "23456789abcdefghjkmnpqrstuvwxyz".toCharArray();
    private static final java.security.SecureRandom RNG = new java.security.SecureRandom();

    private String generateUniqueEventCode() {
        for (int attempt = 0; attempt < 5; attempt++) {
            StringBuilder sb = new StringBuilder("evt-");
            for (int i = 0; i < 6; i++) sb.append(ALPHABET[RNG.nextInt(ALPHABET.length)]);
            String candidate = sb.toString();
            if (!eventRepository.existsByEventCode(candidate)) return candidate;
        }
        throw new ApiException(ErrorCode.INTERNAL_ERROR, "event_code 생성 실패. 다시 시도해 주세요.");
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

    @PutMapping("/{id}/sheets")
    public Event updateSheets(@PathVariable UUID id, @RequestBody SheetsConfigRequest req) {
        Event event = eventRepository.findById(id)
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND));
        if (req.spreadsheetId != null) event.setSpreadsheetId(req.spreadsheetId.trim().isEmpty() ? null : req.spreadsheetId.trim());
        if (req.sheetName != null)     event.setSheetName(req.sheetName.trim().isEmpty() ? null : req.sheetName.trim());
        if (req.enabled != null)       event.setSheetsEnabled(req.enabled);
        return eventRepository.save(event);
    }

    /** 행사 내 모든 리드를 Sheets 에 재동기화. 비동기 큐가 아닌 동기로 순차 append. */
    @PostMapping("/{id}/sheets/sync")
    public Map<String, Object> syncSheets(@PathVariable UUID id) {
        Event event = eventRepository.findById(id)
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND));
        if (!event.isSheetsEnabled() || event.getSpreadsheetId() == null || event.getSpreadsheetId().isBlank()) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "이 행사에 Sheets 매핑이 설정되어 있지 않습니다.");
        }
        List<Lead> leads = leadRepository.findAll().stream()
                .filter(l -> l.getEventId().equals(event.getId())).toList();
        int ok = 0, fail = 0;
        String firstError = null;
        for (Lead l : leads) {
            try { sheetsSyncService.syncOne(l.getId(), event.getId()); ok++; }
            catch (Exception e) { fail++; if (firstError == null) firstError = e.getMessage(); }
        }
        return Map.of("total", leads.size(), "ok", ok, "fail", fail,
                "firstError", firstError == null ? "" : firstError);
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

    public static class SheetsConfigRequest {
        public String spreadsheetId;
        public String sheetName;
        public Boolean enabled;
    }
}
