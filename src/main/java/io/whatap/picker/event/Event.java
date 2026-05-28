package io.whatap.picker.event;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "event")
public class Event {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "event_code", nullable = false, unique = true, length = 80)
    private String eventCode;

    @Column(name = "event_date", nullable = false)
    private LocalDate eventDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    @Column(nullable = false, length = 200)
    private String label;

    @Column(name = "form_template_id")
    private UUID formTemplateId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "form_schema_snapshot", columnDefinition = "jsonb")
    private JsonNode formSchemaSnapshot;

    @Column(name = "form_locked", nullable = false)
    private boolean formLocked = false;

    @Column(name = "qr_image_path", length = 255)
    private String qrImagePath;

    @Column(name = "spreadsheet_id", length = 255)
    private String spreadsheetId;

    @Column(name = "sheet_name", length = 255)
    private String sheetName;

    @Column(name = "sheets_enabled", nullable = false)
    private boolean sheetsEnabled = false;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private EventStatus status = EventStatus.DRAFT;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    protected Event() {}

    public Event(String eventCode, LocalDate eventDate, String label) {
        this.eventCode = eventCode;
        this.eventDate = eventDate;
        this.label = label;
    }

    public UUID getId() { return id; }
    public String getEventCode() { return eventCode; }
    public void setEventCode(String v) { this.eventCode = v; }
    public LocalDate getEventDate() { return eventDate; }
    public void setEventDate(LocalDate v) { this.eventDate = v; }
    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate v) { this.endDate = v; }
    public String getLabel() { return label; }
    public void setLabel(String v) { this.label = v; }
    public UUID getFormTemplateId() { return formTemplateId; }
    public void setFormTemplateId(UUID v) { this.formTemplateId = v; }
    public JsonNode getFormSchemaSnapshot() { return formSchemaSnapshot; }
    public void setFormSchemaSnapshot(JsonNode v) { this.formSchemaSnapshot = v; }
    public boolean isFormLocked() { return formLocked; }
    public void setFormLocked(boolean v) { this.formLocked = v; }
    public String getQrImagePath() { return qrImagePath; }
    public void setQrImagePath(String v) { this.qrImagePath = v; }
    public String getSpreadsheetId() { return spreadsheetId; }
    public void setSpreadsheetId(String v) { this.spreadsheetId = v; }
    public String getSheetName() { return sheetName; }
    public void setSheetName(String v) { this.sheetName = v; }
    public boolean isSheetsEnabled() { return sheetsEnabled; }
    public void setSheetsEnabled(boolean v) { this.sheetsEnabled = v; }
    public EventStatus getStatus() { return status; }
    public void setStatus(EventStatus v) { this.status = v; }
    public UUID getCreatedBy() { return createdBy; }
    public void setCreatedBy(UUID v) { this.createdBy = v; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
