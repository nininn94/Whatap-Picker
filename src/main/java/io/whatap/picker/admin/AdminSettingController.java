package io.whatap.picker.admin;

import io.whatap.picker.auth.jwt.AppPrincipal;
import io.whatap.picker.setting.AppSettingService;
import io.whatap.picker.sheets.SheetsClient;
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
    private final SheetsClient sheetsClient;

    public AdminSettingController(AppSettingService settings, SheetsClient sheetsClient) {
        this.settings = settings;
        this.sheetsClient = sheetsClient;
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
        String saJson = settings.googleServiceAccountJson();
        Map<String, Object> google = new LinkedHashMap<>();
        google.put("configured", saJson != null && !saJson.isBlank());
        google.put("serviceAccountEmail", extractClientEmail(saJson));
        out.put("google", google);
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
        if (req.google != null) {
            if (req.google.serviceAccountJson != null && !req.google.serviceAccountJson.isBlank()) {
                settings.put(AppSettingService.GOOGLE_SERVICE_ACCOUNT_JSON,
                        req.google.serviceAccountJson.trim(), actorId);
            }
        }
        return get();
    }

    @DeleteMapping("/anthropic/api-key")
    public Map<String, Object> clearApiKey(@AuthenticationPrincipal AppPrincipal actor) {
        settings.put(AppSettingService.ANTHROPIC_API_KEY, "", actor != null ? actor.userId() : null);
        return get();
    }

    @DeleteMapping("/google/service-account")
    public Map<String, Object> clearGoogleServiceAccount(@AuthenticationPrincipal AppPrincipal actor) {
        settings.put(AppSettingService.GOOGLE_SERVICE_ACCOUNT_JSON, "",
                actor != null ? actor.userId() : null);
        return get();
    }

    /** Sheets 연결 테스트 — 시트 ID 의 메타데이터(타이틀) 조회. */
    @PostMapping("/google/test")
    public Map<String, Object> testGoogle(@RequestBody TestSheetRequest req) {
        if (req == null || req.spreadsheetId == null || req.spreadsheetId.isBlank()) {
            return Map.of("ok", false, "error", "spreadsheetId 가 필요합니다.");
        }
        try {
            String title = sheetsClient.testConnection(req.spreadsheetId.trim());
            return Map.of("ok", true, "title", title);
        } catch (Exception e) {
            return Map.of("ok", false, "error", e.getMessage() == null ? e.toString() : e.getMessage());
        }
    }

    private static String mask(String key) {
        if (key == null || key.isBlank()) return null;
        if (key.length() <= 10) return "********";
        return key.substring(0, 7) + "***" + key.substring(key.length() - 4);
    }

    /** Service Account JSON 에서 client_email 만 파싱해 표시용으로 반환. */
    private static String extractClientEmail(String json) {
        if (json == null) return null;
        int i = json.indexOf("\"client_email\"");
        if (i < 0) return null;
        int colon = json.indexOf(':', i);
        int q1 = json.indexOf('"', colon + 1);
        int q2 = json.indexOf('"', q1 + 1);
        if (q1 < 0 || q2 < 0) return null;
        return json.substring(q1 + 1, q2);
    }

    public static class UpdateRequest {
        public Anthropic anthropic;
        public Google google;
        public static class Anthropic {
            public String apiKey;
            public String model;
            public Boolean enabled;
        }
        public static class Google {
            public String serviceAccountJson;
        }
    }

    public static class TestSheetRequest {
        public String spreadsheetId;
    }
}
