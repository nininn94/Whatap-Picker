package io.whatap.picker.form;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.whatap.picker.common.ApiException;
import io.whatap.picker.common.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.util.Set;
import java.util.UUID;

@Service
public class FormTemplateService {

    private static final Logger log = LoggerFactory.getLogger(FormTemplateService.class);

    /** plan v8 §3.5에 명시된 시스템 핵심 키 — 폼 빌더에서 제거/수정 불가.
     *  동의(consent) 키는 별도 처리: privacyConsent+marketingConsent 둘 다 OR fullConsent 단일. */
    private static final Set<String> REQUIRED_KEYS = Set.of(
            "firstName", "lastName", "phone", "email",
            "industry", "jobFunction", "jobLevel", "companySize",
            "employeeCountRange", "monitoringStatus",
            "adoptionBlocker", "interestProducts",
            "planWithinYear", "consultationPreference"
    );

    private final FormTemplateRepository repository;
    private final ObjectMapper objectMapper;

    public FormTemplateService(FormTemplateRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    public FormTemplate getSystemDefault() {
        return repository.findBySystemDefaultTrue()
                .orElseThrow(() -> new IllegalStateException("System default form template not seeded."));
    }

    public FormTemplate get(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "폼 템플릿을 찾을 수 없습니다."));
    }

    public FormTemplate save(FormTemplate template) {
        validateSchema(template.getSchema());
        return repository.save(template);
    }

    public FormTemplate clone(UUID sourceId, String newName, UUID actorId) {
        FormTemplate source = get(sourceId);
        FormTemplate copy = new FormTemplate(newName, source.getSchema(), false);
        copy.setClonedFromId(source.getId());
        copy.setCreatedBy(actorId);
        return repository.save(copy);
    }

    public void update(UUID id, String name, JsonNode schema, int expectedVersion) {
        FormTemplate template = get(id);
        if (!template.getVersion().equals(expectedVersion)) {
            throw new ApiException(ErrorCode.IN_USE, "다른 사용자에 의해 변경되었습니다. 새로 고침 후 다시 시도하세요.");
        }
        validateSchema(schema);
        template.setName(name);
        template.setSchema(schema);
        repository.save(template);
    }

    public void delete(UUID id) {
        FormTemplate template = get(id);
        if (template.isSystemDefault()) {
            // 참조 무결성 안전장치: 시드 폼은 삭제 금지 (다른 행사가 fallback 으로 참조 중일 수 있음)
            throw new ApiException(ErrorCode.LOCKED_TEMPLATE,
                    "시스템 기본 템플릿은 삭제할 수 없습니다 (편집은 가능).");
        }
        repository.delete(template);
    }

    public JsonNode loadDefaultSchemaFromClasspath() {
        try (InputStream in = new ClassPathResource("seed/form-template-whatap-default.json").getInputStream()) {
            return objectMapper.readTree(in);
        } catch (IOException e) {
            throw new IllegalStateException("기본 폼 템플릿 시드 파일을 읽지 못했습니다.", e);
        }
    }

    public void seedSystemDefaultIfMissing() {
        if (repository.findBySystemDefaultTrue().isPresent()) {
            log.info("System default form template already present, skip seeding.");
            return;
        }
        JsonNode schema = loadDefaultSchemaFromClasspath();
        validateSchema(schema);
        FormTemplate template = new FormTemplate("와탭 기본 설문 v1", schema, true);
        repository.save(template);
        log.info("Seeded system default form template.");
    }

    /** plan §3.5 — 시스템 핵심 키 누락 시 거부. */
    public void validateSchema(JsonNode schema) {
        if (schema == null || !schema.has("pages")) {
            throw new ApiException(ErrorCode.SCHEMA_INVALID, "schema.pages 가 필요합니다.");
        }
        java.util.Set<String> presentKeys = new java.util.HashSet<>();
        schema.path("pages").forEach(page -> page.path("fields").forEach(field -> {
            String key = field.path("key").asText("");
            if (!key.isBlank()) presentKeys.add(key);
        }));
        schema.path("consents").forEach(consent -> presentKeys.add(consent.path("key").asText("")));

        for (String required : REQUIRED_KEYS) {
            if (!presentKeys.contains(required)) {
                throw new ApiException(ErrorCode.SCHEMA_INVALID,
                        "시스템 핵심 키 '%s' 가 schema 에서 누락되었습니다.".formatted(required));
            }
        }

        // 동의 항목: 통합형(fullConsent) 또는 분리형(privacyConsent+marketingConsent) 중 하나는 있어야 함
        boolean hasUnifiedConsent = presentKeys.contains("fullConsent");
        boolean hasSplitConsent   = presentKeys.contains("privacyConsent")
                                 && presentKeys.contains("marketingConsent");
        if (!hasUnifiedConsent && !hasSplitConsent) {
            throw new ApiException(ErrorCode.SCHEMA_INVALID,
                    "동의 항목이 필요합니다. (fullConsent 단일 또는 privacyConsent+marketingConsent)");
        }
    }
}
