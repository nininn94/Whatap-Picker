package io.whatap.picker.admin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.whatap.picker.auth.jwt.AppPrincipal;
import io.whatap.picker.common.ApiException;
import io.whatap.picker.common.ErrorCode;
import io.whatap.picker.setting.AppSettingService;
import io.whatap.picker.sheets.SheetsClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/admin/settings")
@PreAuthorize("hasRole('ADMIN')")
public class AdminSettingController {

    private static final Pattern EMAIL_RE =
            Pattern.compile("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

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
                String trimmed = req.google.serviceAccountJson.trim();
                // 형식 검증 — type=service_account 필수, private_key 포함, client_email 형식.
                try {
                    JsonNode node = OBJECT_MAPPER.readTree(trimmed);
                    if (!"service_account".equals(node.path("type").asText())) {
                        throw new ApiException(ErrorCode.VALIDATION_FAILED,
                                "Service Account JSON 이 아닙니다 (type 필드 확인).");
                    }
                    if (node.path("private_key").asText().isBlank()) {
                        throw new ApiException(ErrorCode.VALIDATION_FAILED,
                                "private_key 가 비어 있습니다.");
                    }
                    String email = node.path("client_email").asText();
                    if (!EMAIL_RE.matcher(email).matches()) {
                        throw new ApiException(ErrorCode.VALIDATION_FAILED,
                                "client_email 형식이 올바르지 않습니다.");
                    }
                } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
                    throw new ApiException(ErrorCode.VALIDATION_FAILED,
                            "JSON 파싱 실패: " + e.getOriginalMessage());
                }
                settings.put(AppSettingService.GOOGLE_SERVICE_ACCOUNT_JSON, trimmed, actorId);
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

    /**
     * Service Account JSON 에서 client_email 만 파싱해 표시용으로 반환.
     * Jackson 으로 안전 파싱 + 이메일 형식 통과한 값만 반환 → 잘못된 JSON 으로 인한
     * 응답 오염/XSS payload 주입 방지.
     */
    private static String extractClientEmail(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            JsonNode node = OBJECT_MAPPER.readTree(json);
            String email = node.path("client_email").asText();
            return EMAIL_RE.matcher(email).matches() ? email : null;
        } catch (Exception e) {
            return null;
        }
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
