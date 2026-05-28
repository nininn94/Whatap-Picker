package io.whatap.picker.admin;

import com.fasterxml.jackson.databind.JsonNode;
import io.whatap.picker.auth.jwt.AppPrincipal;
import io.whatap.picker.common.ApiException;
import io.whatap.picker.common.ErrorCode;
import io.whatap.picker.form.FormTemplate;
import io.whatap.picker.form.FormTemplateRepository;
import io.whatap.picker.form.FormTemplateService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/forms")
@PreAuthorize("hasRole('ADMIN')")
public class AdminFormController {

    private final FormTemplateService formTemplateService;
    private final FormTemplateRepository formTemplateRepository;

    public AdminFormController(FormTemplateService formTemplateService,
                               FormTemplateRepository formTemplateRepository) {
        this.formTemplateService = formTemplateService;
        this.formTemplateRepository = formTemplateRepository;
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return formTemplateRepository.findAll().stream()
                .<Map<String,Object>>map(t -> Map.of(
                        "id", t.getId(),
                        "name", t.getName(),
                        "isSystemDefault", t.isSystemDefault(),
                        "version", t.getVersion(),
                        "updatedAt", t.getUpdatedAt()))
                .toList();
    }

    @GetMapping("/{id}")
    public FormTemplate get(@PathVariable UUID id) {
        return formTemplateService.get(id);
    }

    @PostMapping("/clone")
    public FormTemplate clone(@RequestBody Map<String, Object> body,
                              @AuthenticationPrincipal AppPrincipal actor) {
        String sourceIdStr = (String) body.get("sourceId");
        String name = (String) body.get("name");
        if (sourceIdStr == null || name == null) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "sourceId, name 이 필요합니다.");
        }
        return formTemplateService.clone(UUID.fromString(sourceIdStr), name,
                actor != null ? actor.userId() : null);
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable UUID id,
                                      @RequestBody UpdateRequest req) {
        formTemplateService.update(id, req.name(), req.schema(), req.version());
        FormTemplate t = formTemplateService.get(id);
        return Map.of("id", t.getId(), "version", t.getVersion(),
                "updatedAt", t.getUpdatedAt());
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable UUID id) {
        formTemplateService.delete(id);
    }

    public record UpdateRequest(String name, JsonNode schema, int version) {}
}
