package io.whatap.picker.admin;

import io.whatap.picker.auth.jwt.AppPrincipal;
import io.whatap.picker.setting.AppSettingService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/settings")
@PreAuthorize("hasRole('ADMIN')")
public class AdminSettingController {

    private final AppSettingService settings;

    public AdminSettingController(AppSettingService settings) {
        this.settings = settings;
    }

    /**
     * 응답에는 API 키 값을 그대로 노출하지 않고 마스킹.
     * UI 에서는 "변경하지 않음"을 비워두는 식으로 처리.
     */
    @GetMapping
    public Map<String, Object> get() {
        Map<String, Object> out = new LinkedHashMap<>();
        String apiKey = settings.anthropicApiKey();
        out.put("anthropic", Map.of(
                "enabled", settings.getBoolean(AppSettingService.ANTHROPIC_ENABLED, true),
                "model",   settings.anthropicModel(),
                "apiKeyMask", mask(apiKey),
                "configured", apiKey != null && !apiKey.isBlank()
        ));
        return out;
    }

    @PutMapping
    public Map<String, Object> update(@RequestBody UpdateRequest req,
                                      @AuthenticationPrincipal AppPrincipal actor) {
        UUID actorId = actor != null ? actor.userId() : null;
        if (req.anthropic != null) {
            if (req.anthropic.apiKey != null && !req.anthropic.apiKey.isBlank()) {
                settings.put(AppSettingService.ANTHROPIC_API_KEY, req.anthropic.apiKey.trim(), actorId);
            }
            if (req.anthropic.model != null && !req.anthropic.model.isBlank()) {
                settings.put(AppSettingService.ANTHROPIC_MODEL, req.anthropic.model.trim(), actorId);
            }
            if (req.anthropic.enabled != null) {
                settings.put(AppSettingService.ANTHROPIC_ENABLED, String.valueOf(req.anthropic.enabled), actorId);
            }
        }
        return get();
    }

    @DeleteMapping("/anthropic/api-key")
    public Map<String, Object> clearApiKey(@AuthenticationPrincipal AppPrincipal actor) {
        settings.put(AppSettingService.ANTHROPIC_API_KEY, "", actor != null ? actor.userId() : null);
        return get();
    }

    private static String mask(String key) {
        if (key == null || key.isBlank()) return null;
        if (key.length() <= 10) return "********";
        return key.substring(0, 7) + "***" + key.substring(key.length() - 4);
    }

    public static class UpdateRequest {
        public Anthropic anthropic;
        public static class Anthropic {
            public String apiKey;
            public String model;
            public Boolean enabled;
        }
    }
}
