package io.whatap.picker.ai.rules;

import io.whatap.picker.ai.enums.Grade;
import io.whatap.picker.ai.enums.NextAction;
import io.whatap.picker.lead.Lead;
import io.whatap.picker.lead.enums.ConsultationPreference;
import io.whatap.picker.lead.enums.JobFunction;
import io.whatap.picker.lead.enums.JobLevel;
import io.whatap.picker.lead.enums.PlanWithinYear;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * 시드 룰 10개 (8 결정적 + 2 LLM 힌트). plan v8 §4.6.4.
 * 약 80~85% Lead 가 LLM 호출 없이 즉시 분류되도록 설계.
 */
@Component
public class RuleEngine {

    public RuleOutcome evaluate(Lead lead) {
        List<String> hits = new ArrayList<>();

        // 1. STUDENT_AUTO_C
        if (lead.getJobFunction() == JobFunction.STUDENT_FREELANCER) {
            hits.add("STUDENT_AUTO_C");
            return RuleOutcome.terminal(Grade.KNOWN_LEAD, 20, NextAction.NURTURE_NEWSLETTER,
                    "학생/프리랜서 - 후속 nurture 대상", hits);
        }

        // 2. EXEC_REPLACE_AUTO_A
        if (in(lead.getJobLevel(), JobLevel.TOP_EXECUTIVE, JobLevel.SENIOR_MGR)
                && in(lead.getPlanWithinYear(), PlanWithinYear.C_REPLACE, PlanWithinYear.D_NEW_ADOPT)) {
            hits.add("EXEC_REPLACE_AUTO_A");
            return RuleOutcome.terminal(Grade.MQL, 90, NextAction.MEETING_PROPOSAL_24H,
                    "결정권자 + 명확한 교체/도입 계획", hits);
        }

        // 3. EXEC_ONSITE_AUTO_A
        if (lead.getJobLevel() == JobLevel.TOP_EXECUTIVE
                && lead.getConsultationPreference() == ConsultationPreference.ONSITE_MEETING) {
            hits.add("EXEC_ONSITE_AUTO_A");
            return RuleOutcome.terminal(Grade.MQL, 85, NextAction.MEETING_PROPOSAL_24H,
                    "결정권자가 방문 미팅을 직접 요청", hits);
        }

        // 4. MGR_REPLACE_AUTO_A
        if (lead.getJobLevel() == JobLevel.MID_MGR
                && lead.getPlanWithinYear() == PlanWithinYear.C_REPLACE
                && lead.getConsultationPreference() == ConsultationPreference.ONSITE_MEETING) {
            hits.add("MGR_REPLACE_AUTO_A");
            return RuleOutcome.terminal(Grade.MQL, 82, NextAction.MEETING_PROPOSAL_WEEK,
                    "중간 관리자 + 교체 계획 + 방문 희망", hits);
        }

        // 5. DISSATISFIED_REPLACE_AUTO_A
        String satisfaction = digSatisfaction(lead);
        if (("DISSATISFIED".equals(satisfaction) || "VERY_DISSATISFIED".equals(satisfaction))
                && in(lead.getPlanWithinYear(), PlanWithinYear.C_REPLACE, PlanWithinYear.D_NEW_ADOPT)) {
            hits.add("DISSATISFIED_REPLACE_AUTO_A");
            return RuleOutcome.terminal(Grade.MQL, 80, NextAction.MEETING_PROPOSAL_WEEK,
                    "현재 솔루션 불만 + 교체 계획", hits);
        }

        // 6. STAFF_NO_PLAN_AUTO_C
        if (lead.getJobLevel() == JobLevel.STAFF
                && lead.getPlanWithinYear() == PlanWithinYear.A_OPEN
                && lead.getConsultationPreference() == ConsultationPreference.EMAIL_OR_PHONE) {
            hits.add("STAFF_NO_PLAN_AUTO_C");
            return RuleOutcome.terminal(Grade.KNOWN_LEAD, 30, NextAction.NURTURE_NEWSLETTER,
                    "실무자 + 검토 단계, 메일만 희망", hits);
        }

        // 7. EXPAND_PLAN_AUTO_B
        if (lead.getPlanWithinYear() == PlanWithinYear.B_EXPAND
                && in(lead.getJobLevel(), JobLevel.SENIOR_MGR, JobLevel.MID_MGR)) {
            hits.add("EXPAND_PLAN_AUTO_B");
            return RuleOutcome.terminal(Grade.MQL, 65, NextAction.PRODUCT_INTRO_EMAIL,
                    "관리자급 + 확장 도입 계획", hits);
        }

        // 8. NO_INTEREST_AUTO_C
        if ((lead.getInterestProducts() == null || lead.getInterestProducts().isEmpty())
                && lead.getPlanWithinYear() == PlanWithinYear.A_OPEN) {
            hits.add("NO_INTEREST_AUTO_C");
            return RuleOutcome.terminal(Grade.KNOWN_LEAD, 25, NextAction.NURTURE_NEWSLETTER,
                    "관심 제품 없음 + 검토 단계", hits);
        }

        // 9. DISSATISFIED_HINT (LLM 힌트)
        if ("DISSATISFIED".equals(satisfaction) || "VERY_DISSATISFIED".equals(satisfaction)) {
            hits.add("DISSATISFIED_HINT");
        }

        // 10. EXEC_HINT (LLM 힌트)
        if (in(lead.getJobLevel(), JobLevel.TOP_EXECUTIVE, JobLevel.SENIOR_MGR)) {
            hits.add("EXEC_HINT");
        }

        return RuleOutcome.hints(hits);
    }

    private String digSatisfaction(Lead lead) {
        if (lead.getSurveyPayload() == null || lead.getSurveyPayload().other() == null
                || lead.getSurveyPayload().other().commercial() == null) {
            return null;
        }
        return lead.getSurveyPayload().other().commercial().satisfaction();
    }

    @SafeVarargs
    private static <E extends Enum<E>> boolean in(E value, E... candidates) {
        if (value == null) return false;
        return Set.of(candidates).contains(value);
    }
}
