package io.whatap.picker.ai;

import io.whatap.picker.ai.enums.Grade;
import io.whatap.picker.ai.enums.NextAction;

/**
 * Spring AI BeanOutputConverter 타겟 record.
 * LLM 응답을 JSON으로 강제하고 이 record로 자동 매핑.
 */
public record LeadScoreResult(
        Grade grade,
        int score,
        NextAction nextAction,
        String reason
) {}
