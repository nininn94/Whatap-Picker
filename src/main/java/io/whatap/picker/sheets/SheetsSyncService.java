package io.whatap.picker.sheets;

import io.whatap.picker.event.Event;
import io.whatap.picker.event.EventRepository;
import io.whatap.picker.lead.Lead;
import io.whatap.picker.lead.LeadRepository;
import io.whatap.picker.lead.event.LeadSubmittedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

/**
 * 리드 제출 이벤트를 받아 Google Sheets 에 행을 append.
 * 행사 단위로 spreadsheet 매핑이 활성화돼 있고 Service Account JSON 도 설정돼 있을 때만 동작.
 * 실패는 로그만 남기고 본 제출에는 영향 없음.
 */
@Service
public class SheetsSyncService {

    private static final Logger log = LoggerFactory.getLogger(SheetsSyncService.class);

    private static final List<Object> HEADER = Arrays.asList(
            "제출시각", "이벤트 코드",
            "성", "이름", "회사", "이메일", "휴대폰",
            "산업", "직무", "직급", "기업규모", "직원수",
            "모니터링 상태", "관심 제품", "1년 계획", "상담 희망", "망설이는 이유",
            "리드 ID"
    );

    private final SheetsClient sheets;
    private final EventRepository eventRepository;
    private final LeadRepository leadRepository;

    public SheetsSyncService(SheetsClient sheets,
                             EventRepository eventRepository,
                             LeadRepository leadRepository) {
        this.sheets = sheets;
        this.eventRepository = eventRepository;
        this.leadRepository = leadRepository;
    }

    /**
     * AFTER_COMMIT 시점에 실행 — Lead 가 DB 에 commit 된 후에야 호출되므로
     * findById 가 누락되는 race condition 차단. (이전엔 @EventListener 가 publish 즉시
     * 별도 스레드에서 돌아 commit 전에 leadRepository.findById 가 null 반환 → silent skip)
     */
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(readOnly = true)
    public void onLeadSubmitted(LeadSubmittedEvent ev) {
        try { syncOne(ev.leadId(), ev.eventId()); }
        catch (Exception e) { log.warn("Sheets sync 실패 leadId={}: {}", ev.leadId(), e.toString(), e); }
    }

    /**
     * 리드 삭제 시 시트에서도 해당 행 제거. 시트 매핑이 없거나 미설정이면 silent skip.
     * HEADER 마지막 컬럼이 "리드 ID" 라서 컬럼 letter 는 "R" (18번째). HEADER 순서 변경 시
     * 이 letter 도 같이 바꿔야 함.
     */
    public boolean deleteOne(UUID leadId, UUID eventId) throws Exception {
        Event event = eventRepository.findById(eventId).orElse(null);
        if (event == null) return false;
        if (!event.isSheetsEnabled() || event.getSpreadsheetId() == null || event.getSpreadsheetId().isBlank()) return false;
        if (!sheets.isConfigured()) return false;

        String sheetName = (event.getSheetName() == null || event.getSheetName().isBlank())
                ? "Leads" : event.getSheetName();
        log.info("Sheets deleteRow 시도 eventCode={} sheet={} leadId={}",
                event.getEventCode(), sheetName, leadId);
        return sheets.deleteRowByLeadId(event.getSpreadsheetId(), sheetName, "R", leadId.toString());
    }

    /** 행사+리드 한 쌍을 시트에 append (테스트/재동기화에서도 호출). */
    public void syncOne(UUID leadId, UUID eventId) throws Exception {
        Event event = eventRepository.findById(eventId).orElse(null);
        if (event == null) {
            log.warn("Sheets sync skip — event not found eventId={}", eventId);
            return;
        }
        if (!event.isSheetsEnabled()) {
            log.info("Sheets sync skip — eventCode={} sheets_enabled=false", event.getEventCode());
            return;
        }
        if (event.getSpreadsheetId() == null || event.getSpreadsheetId().isBlank()) {
            log.info("Sheets sync skip — eventCode={} spreadsheetId 비어있음", event.getEventCode());
            return;
        }
        if (!sheets.isConfigured()) {
            log.warn("Sheets sync skip — Service Account JSON 미설정 (eventCode={})", event.getEventCode());
            return;
        }
        Lead lead = leadRepository.findById(leadId).orElse(null);
        if (lead == null) {
            log.warn("Sheets sync skip — lead not found leadId={}", leadId);
            return;
        }

        String sheetName = (event.getSheetName() == null || event.getSheetName().isBlank())
                ? "Leads" : event.getSheetName();

        log.info("Sheets sync 시작 eventCode={} sheet={} leadId={}",
                event.getEventCode(), sheetName, leadId);
        sheets.ensureHeader(event.getSpreadsheetId(), sheetName, HEADER);
        sheets.appendRow(event.getSpreadsheetId(), sheetName, toRow(event, lead));
        log.info("Sheets sync 완료 eventCode={} leadId={}", event.getEventCode(), leadId);
    }

    private static List<Object> toRow(Event event, Lead l) {
        List<Object> row = new ArrayList<>();
        row.add(l.getCreatedAt() != null ? l.getCreatedAt().toString() : "");
        row.add(event.getEventCode());
        row.add(nz(l.getLastName()));
        row.add(nz(l.getFirstName()));
        row.add(nz(l.getCompany()));
        row.add(nz(l.getEmail()));
        row.add(nz(l.getPhone()));
        row.add(nameOf(l.getIndustry()));
        row.add(nameOf(l.getJobFunction()));
        row.add(nameOf(l.getJobLevel()));
        row.add(nameOf(l.getCompanySize()));
        row.add(nameOf(l.getEmployeeCountRange()));
        row.add(nameOf(l.getMonitoringStatus()));
        row.add(l.getInterestProducts() == null
                ? "" : l.getInterestProducts().stream().map(Enum::name).reduce((a,b) -> a + ", " + b).orElse(""));
        row.add(nameOf(l.getPlanWithinYear()));
        row.add(nameOf(l.getConsultationPreference()));
        row.add(nameOf(l.getAdoptionBlocker()));
        row.add(l.getId() != null ? l.getId().toString() : "");
        return row;
    }

    private static String nz(String s) { return s == null ? "" : s; }
    private static String nameOf(Enum<?> e) { return e == null ? "" : e.name(); }
}
