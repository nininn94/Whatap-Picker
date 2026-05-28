package io.whatap.picker.setting;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class AppSettingService {

    // Anthropic 관련 설정 키
    public static final String ANTHROPIC_API_KEY = "anthropic.api_key";
    public static final String ANTHROPIC_MODEL   = "anthropic.model";
    public static final String ANTHROPIC_ENABLED = "anthropic.enabled";

    public static final String DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5";

    private final AppSettingRepository repository;

    public AppSettingService(AppSettingRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public Optional<String> get(String key) {
        return repository.findByKey(key).map(AppSetting::getValue);
    }

    public String getOrDefault(String key, String defaultValue) {
        return get(key).filter(v -> !v.isBlank()).orElse(defaultValue);
    }

    public boolean getBoolean(String key, boolean defaultValue) {
        return get(key).map(v -> "true".equalsIgnoreCase(v) || "1".equals(v)).orElse(defaultValue);
    }

    @Transactional
    public void put(String key, String value, UUID actorId) {
        AppSetting s = repository.findByKey(key).orElseGet(() -> new AppSetting(key, value));
        s.setValue(value);
        s.setUpdatedBy(actorId);
        repository.save(s);
    }

    @Transactional
    public void putAll(Map<String, String> entries, UUID actorId) {
        entries.forEach((k, v) -> put(k, v, actorId));
    }

    @Transactional(readOnly = true)
    public Map<String, String> findAll() {
        Map<String, String> out = new java.util.LinkedHashMap<>();
        repository.findAll().forEach(s -> out.put(s.getKey(), s.getValue()));
        return out;
    }

    // ---- 편의 메서드 (Anthropic) ----

    public boolean isAnthropicConfigured() {
        return get(ANTHROPIC_API_KEY).map(v -> !v.isBlank()).orElse(false)
                && getBoolean(ANTHROPIC_ENABLED, true);
    }

    public String anthropicApiKey() {
        return get(ANTHROPIC_API_KEY).orElse(null);
    }

    public String anthropicModel() {
        return getOrDefault(ANTHROPIC_MODEL, DEFAULT_ANTHROPIC_MODEL);
    }
}
