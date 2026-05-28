package io.whatap.picker.ai.rules;

import io.whatap.picker.ai.enums.Grade;
import io.whatap.picker.ai.enums.NextAction;
import io.whatap.picker.lead.Lead;
import io.whatap.picker.lead.enums.ConsultationPreference;
import io.whatap.picker.lead.enums.PlanWithinYear;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Lifecycle Stage 결정 룰 — MQL / KNOWN_LEAD 2 단계.
 *
 * <p>MQL 조건 (OR):
 * <ol>
 *   <li>상담 희망 = 대면 미팅 (ONSITE_MEETING)</li>
 *   <li>1년 내 계획 = 신규 도입 (D_NEW_ADOPT) 또는 교체 (C_REPLACE)</li>
 * </ol>
 * <p>그 외는 모두 KNOWN_LEAD.
 *
 * <p>두 조건 모두 deterministic — LLM 호출 없이 즉시 결정.
 */
@Component
public class RuleEngine {

    public RuleOutcome evaluate(Lead lead) {
        List<String> hits = new ArrayList<>();

        boolean onsiteMeeting = lead.getConsultationPreference() == ConsultationPreference.ONSITE_MEETING;
        boolean adoptOrReplace =
                lead.getPlanWithinYear() == PlanWithinYear.D_NEW_ADOPT
             || lead.getPlanWithinYear() == PlanWithinYear.C_REPLACE;

        if (onsiteMeeting)  hits.add("ONSITE_MEETING");
        if (adoptOrReplace) hits.add("ADOPT_OR_REPLACE_WITHIN_YEAR");

        if (onsiteMeeting || adoptOrReplace) {
            int score = onsiteMeeting && adoptOrReplace ? 90 : 75;
            NextAction action = onsiteMeeting
                    ? NextAction.MEETING_PROPOSAL_24H
                    : NextAction.MEETING_PROPOSAL_WEEK;
            String reason = onsiteMeeting && adoptOrReplace
                    ? "대면 미팅 희망 + 1년 내 도입/교체 계획"
                    : (onsiteMeeting ? "대면 미팅 희망" : "1년 내 도입/교체 계획");
            return RuleOutcome.terminal(Grade.MQL, score, action, reason, hits);
        }

        return RuleOutcome.terminal(Grade.KNOWN_LEAD, 30,
                NextAction.NURTURE_NEWSLETTER,
                "대면 미팅 의사 없음 + 명확한 도입/교체 계획 없음", hits);
    }
}
