package io.whatap.picker.ai.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.whatap.picker.setting.AppSettingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Anthropic Messages API HTTP client (JDK HttpClient).
 * - API 키는 DB(app_setting)에서 동적으로 읽음.
 * - 모델은 anthropic.model 설정값 (기본 claude-haiku-4-5).
 */
@Component
public class AnthropicClient {

    private static final Logger log = LoggerFactory.getLogger(AnthropicClient.class);
    private static final URI BASE_URI = URI.create("https://api.anthropic.com/v1/messages");
    private static final String ANTHROPIC_VERSION = "2023-06-01";
    private static final int DEFAULT_MAX_TOKENS = 1024;
    private static final Duration TIMEOUT = Duration.ofSeconds(60);

    private final AppSettingService settings;
    private final ObjectMapper objectMapper;
    private final HttpClient http;

    public AnthropicClient(AppSettingService settings, ObjectMapper objectMapper) {
        this.settings = settings;
        this.objectMapper = objectMapper;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    public boolean isAvailable() {
        return settings.isAnthropicConfigured();
    }

    public String modelName() {
        return settings.anthropicModel();
    }

    public String complete(String systemPrompt, String userPrompt) {
        return complete(systemPrompt, userPrompt, DEFAULT_MAX_TOKENS);
    }

    public String complete(String systemPrompt, String userPrompt, int maxTokens) {
        String apiKey = settings.anthropicApiKey();
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("Anthropic API key is not configured.");
        }
        String model = settings.anthropicModel();

        Map<String, Object> body = Map.of(
                "model", model,
                "max_tokens", maxTokens,
                "system", systemPrompt,
                "messages", List.of(Map.of("role", "user", "content", userPrompt))
        );

        try {
            String json = objectMapper.writeValueAsString(body);
            HttpRequest req = HttpRequest.newBuilder(BASE_URI)
                    .timeout(TIMEOUT)
                    .header("x-api-key", apiKey)
                    .header("anthropic-version", ANTHROPIC_VERSION)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build();

            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 != 2) {
                String snippet = res.body();
                if (snippet != null && snippet.length() > 400) snippet = snippet.substring(0, 400) + "...";
                throw new RuntimeException("Anthropic HTTP " + res.statusCode() + ": " + snippet);
            }
            JsonNode root = objectMapper.readTree(res.body());
            JsonNode contentArr = root.path("content");
            if (!contentArr.isArray() || contentArr.isEmpty()) {
                throw new RuntimeException("Anthropic empty response: " + res.body());
            }
            StringBuilder text = new StringBuilder();
            contentArr.forEach(node -> {
                if ("text".equals(node.path("type").asText())) {
                    text.append(node.path("text").asText());
                }
            });
            return text.toString().trim();
        } catch (RuntimeException e) {
            log.warn("Anthropic call failed (model={}): {}", model, e.toString());
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Anthropic call failed", e);
        }
    }
}
