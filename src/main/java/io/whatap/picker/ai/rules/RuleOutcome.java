package io.whatap.picker.ai.rules;

import io.whatap.picker.ai.LeadScoreResult;
import io.whatap.picker.ai.enums.Grade;
import io.whatap.picker.ai.enums.NextAction;

import java.util.ArrayList;
import java.util.List;

/** 룰 평가 결과. terminal 이면 LLM 호출 생략. */
public final class RuleOutcome {

    private final boolean terminal;
    private final Grade grade;
    private final Integer score;
    private final NextAction nextAction;
    private final String reason;
    private final List<String> hits = new ArrayList<>();

    private RuleOutcome(boolean terminal, Grade grade, Integer score,
                        NextAction nextAction, String reason, List<String> hits) {
        this.terminal = terminal;
        this.grade = grade;
        this.score = score;
        this.nextAction = nextAction;
        this.reason = reason;
        this.hits.addAll(hits);
    }

    public static RuleOutcome terminal(Grade grade, int score, NextAction action,
                                       String reason, List<String> hits) {
        return new RuleOutcome(true, grade, score, action, reason, hits);
    }

    public static RuleOutcome hints(List<String> hits) {
        return new RuleOutcome(false, null, null, null, null, hits);
    }

    public boolean isTerminal() { return terminal; }
    public List<String> hits() { return hits; }
    public LeadScoreResult toResult() {
        return new LeadScoreResult(grade, score == null ? 0 : score, nextAction, reason);
    }
}
