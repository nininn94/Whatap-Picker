package io.whatap.picker.ai.client;

import io.whatap.picker.ai.LeadScoreResult;
import io.whatap.picker.ai.enums.Grade;
import io.whatap.picker.ai.enums.NextAction;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Component;

/**
 * LLM 호출 라우터: Ollama → 실패 시 Anthropic → 둘 다 실패 시 예외.
 * - 호출 측은 어떤 백엔드를 썼는지 알 수 있도록 결과와 함께 modelName 반환.
 */
@Component
public class LlmGateway {

    private static final Logger log = LoggerFactory.getLogger(LlmGateway.class);

    private final ChatClient chatClient;
    private final AnthropicClient anthropicClient;
    private final ObjectMapper objectMapper;
    private final String ollamaModelName;

    public LlmGateway(ChatClient leadScoringChatClient,
                      AnthropicClient anthropicClient,
                      ObjectMapper objectMapper,
                      @org.springframework.beans.factory.annotation.Value(
                              "${spring.ai.ollama.chat.options.model:qwen2.5:1.5b}") String ollamaModelName) {
        this.chatClient = leadScoringChatClient;
        this.anthropicClient = anthropicClient;
        this.objectMapper = objectMapper;
        this.ollamaModelName = ollamaModelName;
    }

    /** 구조화된 LeadScoreResult 응답 — 리드 평가용. */
    public Outcome<LeadScoreResult> scoreLead(String systemPrompt, String userPrompt) {
        // 1. Ollama 시도
        try {
            LeadScoreResult r = chatClient.prompt()
                    .system(systemPrompt)
                    .user(userPrompt)
                    .call()
                    .entity(LeadScoreResult.class);
            if (r != null) {
                return new Outcome<>(r, ollamaModelName, "ollama");
            }
        } catch (Exception e) {
            log.warn("Ollama scoreLead failed, will try Anthropic: {}", e.toString());
        }

        // 2. Anthropic 폴백
        if (anthropicClient.isAvailable()) {
            try {
                String raw = anthropicClient.complete(
                        systemPrompt + "\n\n[중요] 반드시 JSON 객체 1개만 출력하세요.",
                        userPrompt);
                LeadScoreResult r = parseLeadScoreJson(raw);
                return new Outcome<>(r, anthropicClient.modelName(), "anthropic");
            } catch (Exception e) {
                log.warn("Anthropic scoreLead also failed: {}", e.toString());
            }
        }

        throw new RuntimeException("LLM 호출 실패 — Ollama 와 Anthropic 모두 사용 불가");
    }

    /** 자유 텍스트 응답 — 마케팅 인사이트용. */
    public Outcome<String> completeText(String systemPrompt, String userPrompt) {
        // 1. Ollama 시도
        try {
            String text = chatClient.prompt()
                    .system(systemPrompt)
                    .user(userPrompt)
                    .call()
                    .content();
            if (text != null && !text.isBlank()) {
                return new Outcome<>(text.trim(), ollamaModelName, "ollama");
            }
        } catch (Exception e) {
            log.warn("Ollama completeText failed, will try Anthropic: {}", e.toString());
        }

        // 2. Anthropic 폴백
        if (anthropicClient.isAvailable()) {
            try {
                String text = anthropicClient.complete(systemPrompt, userPrompt, 1500);
                return new Outcome<>(text, anthropicClient.modelName(), "anthropic");
            } catch (Exception e) {
                log.warn("Anthropic completeText also failed: {}", e.toString());
            }
        }

        throw new RuntimeException("LLM 호출 실패 — Ollama 와 Anthropic 모두 사용 불가");
    }

    private LeadScoreResult parseLeadScoreJson(String raw) {
        // raw 에 코드블록이 섞여있을 수 있어 첫 { 와 마지막 } 사이만 추출.
        int start = raw.indexOf('{');
        int end = raw.lastIndexOf('}');
        if (start < 0 || end < 0 || end <= start) {
            throw new RuntimeException("Anthropic 응답에서 JSON 추출 실패: " + raw);
        }
        String jsonOnly = raw.substring(start, end + 1);
        try {
            JsonNode node = objectMapper.readTree(jsonOnly);
            Grade grade = parseGrade(node.path("grade").asText(null));
            int score = node.path("score").asInt(0);
            NextAction action = parseNextAction(node.path("nextAction").asText(null));
            String reason = node.path("reason").asText("");
            return new LeadScoreResult(grade, score, action, reason);
        } catch (Exception e) {
            throw new RuntimeException("Anthropic JSON 파싱 실패: " + e.getMessage(), e);
        }
    }

    private static Grade parseGrade(String s) {
        if (s == null) return null;
        String u = s.trim().toUpperCase();
        // 과거 프롬프트가 A/B/C 를 반환할 수 있어 호환 매핑.
        if ("A".equals(u) || "B".equals(u)) return Grade.MQL;
        if ("C".equals(u)) return Grade.KNOWN_LEAD;
        try { return Grade.valueOf(u); } catch (Exception e) { return null; }
    }

    private static NextAction parseNextAction(String s) {
        if (s == null) return null;
        try { return NextAction.valueOf(s.trim().toUpperCase()); } catch (Exception e) { return null; }
    }

    public record Outcome<T>(T value, String modelName, String backend) {}
}
