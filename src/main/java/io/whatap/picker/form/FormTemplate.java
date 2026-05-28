package io.whatap.picker.form;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "form_template")
public class FormTemplate {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(name = "is_system_default", nullable = false)
    private boolean systemDefault = false;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private JsonNode schema;

    @Version
    @Column(nullable = false)
    private Integer version = 0;

    @Column(name = "cloned_from_id")
    private UUID clonedFromId;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    @PreUpdate
    void onUpdate() { this.updatedAt = OffsetDateTime.now(); }

    protected FormTemplate() {}

    public FormTemplate(String name, JsonNode schema, boolean systemDefault) {
        this.name = name;
        this.schema = schema;
        this.systemDefault = systemDefault;
    }

    public UUID getId() { return id; }
    public String getName() { return name; }
    public void setName(String v) { this.name = v; }
    public boolean isSystemDefault() { return systemDefault; }
    public JsonNode getSchema() { return schema; }
    public void setSchema(JsonNode v) { this.schema = v; }
    public Integer getVersion() { return version; }
    public UUID getClonedFromId() { return clonedFromId; }
    public void setClonedFromId(UUID v) { this.clonedFromId = v; }
    public UUID getCreatedBy() { return createdBy; }
    public void setCreatedBy(UUID v) { this.createdBy = v; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
