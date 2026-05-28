package io.whatap.picker.ai;

import io.whatap.picker.ai.enums.AiStatus;
import io.whatap.picker.ai.enums.Grade;
import io.whatap.picker.ai.enums.NextAction;
import io.whatap.picker.ai.enums.ScoreSource;
import io.whatap.picker.ai.rules.RuleEngine;
import io.whatap.picker.ai.rules.RuleOutcome;
import io.whatap.picker.lead.Lead;
import io.whatap.picker.lead.LeadRepository;
import io.whatap.picker.lead.event.LeadSubmittedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.prompt.PromptTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Retryable;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

@Service
public class LeadScoringPipeline {

    private static final Logger log = LoggerFactory.getLogger(LeadScoringPipeline.class);

    private static final String SYSTEM_PROMPT = """
            당신은 WhaTap(통합 모니터링 솔루션) 사내 부스 이벤트에서 수집된 B2B 리드를 평가하는 분류기입니다.

            [등급 기준]
            - A: 결정 권한 있음 + 도입/교체 계획 명확 + 현재 솔루션 불만족 또는 미사용
            - B: 영향력 있음 + 추가 도입/확장 계획 또는 만족하지만 신기능 관심
            - C: 결정권 낮음 + 명확한 계획 없음 또는 학생/프리랜서

            [점수 0-100]
            - A: 80-100, B: 50-79, C: 0-49

            [출력]
            반드시 JSON 객체 1개만 출력. 키: grade("A"|"B"|"C"), score(int 0-100),
            nextAction(MEETING_PROPOSAL_24H | MEETING_PROPOSAL_WEEK | PRODUCT_INTRO_EMAIL |
                       TECH_CONSULT_EMAIL | NURTURE_NEWSLETTER | WEBINAR_INVITE | NO_ACTION),
            reason(한국어 1~2문장).
            """;

    private static final String USER_TEMPLATE = """
            [입력]
            직무: {jobFunction}, 직급: {jobLevel}, 산업: {industry}
            기업규모: {companySize}, 직원수: {employeeCountRange}
            현재 모니터링: {monitoringStatus}
            상용 만족도: {satisfaction}
            상용 불만: {complaints}
            망설이는 이유: {adoptionBlocker}
            관심 제품: {interestProducts}
            1년 내 계획: {planWithinYear}
            상담 희망: {consultationPreference}

            [적용된 룰 힌트] {ruleHits}

            위 입력으로 등급, 점수, nextAction, reason 을 평가해주세요.
            """;

    private final LeadRepository leadRepository;
    private final LeadScoreRepository scoreRepository;
    private final RuleEngine ruleEngine;
    private final ChatClient chatClient;
    private final String modelName;

    public LeadScoringPipeline(LeadRepository leadRepository,
                               LeadScoreRepository scoreRepository,
                               RuleEngine ruleEngine,
                               ChatClient leadScoringChatClient,
                               @Value("${spring.ai.ollama.chat.options.model:qwen2.5:1.5b}") String modelName) {
        this.leadRepository = leadRepository;
        this.scoreRepository = scoreRepository;
        this.ruleEngine = ruleEngine;
        this.chatClient = leadScoringChatClient;
        this.modelName = modelName;
    }

    @EventListener
    @Async
    public void onLeadSubmitted(LeadSubmittedEvent event) {
        log.info("LeadSubmittedEvent received, scoring asynchronously: {}", event.leadId());
        try {
            score(event.leadId());
        } catch (Exception e) {
            log.warn("LeadScoringPipeline failed for {}: {}", event.leadId(), e.toString());
        }
    }

    @Retryable(maxAttempts = 3, backoff = @Backoff(delay = 30_000, multiplier = 10))
    @Transactional
    public LeadScore score(UUID leadId) {
        Lead lead = leadRepository.findById(leadId).orElse(null);
        if (lead == null) return null;

        LeadScore scoreEntity = scoreRepository.findByLeadId(leadId).orElseGet(() -> {
            LeadScore s = new LeadScore();
            s.setLeadId(leadId);
            return s;
        });
        if (scoreEntity.getAiStatus() == AiStatus.MANUAL_OVERRIDE) {
            return scoreEntity;
        }
        scoreEntity.setAiStatus(AiStatus.PENDING);
        scoreEntity.setAttemptCount(scoreEntity.getAttemptCount() + 1);
        scoreEntity.setLastAttemptedAt(OffsetDateTime.now());
        scoreRepository.save(scoreEntity);

        RuleOutcome outcome = ruleEngine.evaluate(lead);
        scoreEntity.setRuleHits(outcome.hits());

        if (outcome.isTerminal()) {
            LeadScoreResult r = outcome.toResult();
            applyResult(scoreEntity, r, ScoreSource.RULE, AiStatus.RULE_ONLY);
            return scoreRepository.save(scoreEntity);
        }

        try {
            LeadScoreResult llmResult = callLlm(lead, outcome.hits());
            ScoreSource src = outcome.hits().isEmpty() ? ScoreSource.LLM : ScoreSource.RULE_LLM_HYBRID;
            applyResult(scoreEntity, llmResult, src, AiStatus.DONE);
        } catch (Exception ex) {
            log.warn("Ollama LLM 호출 실패 (leadId={}): {}", leadId, ex.toString());
            scoreEntity.setAiStatus(AiStatus.FAILED);
            scoreEntity.setReason("AI 분석 보류: " + ex.getMessage());
        }

        scoreEntity.setModelName(modelName);
        return scoreRepository.save(scoreEntity);
    }

    private LeadScoreResult callLlm(Lead lead, java.util.List<String> hits) {
        java.util.Map<String, Object> vars = new java.util.HashMap<>();
        vars.put("jobFunction",    nz(lead.getJobFunction()));
        vars.put("jobLevel",       nz(lead.getJobLevel()));
        vars.put("industry",       nz(lead.getIndustry()));
        vars.put("companySize",    nz(lead.getCompanySize()));
        vars.put("employeeCountRange", nz(lead.getEmployeeCountRange()));
        vars.put("monitoringStatus", nz(lead.getMonitoringStatus()));
        vars.put("satisfaction",   digSatisfaction(lead));
        vars.put("complaints",     digComplaints(lead));
        vars.put("adoptionBlocker", nz(lead.getAdoptionBlocker()));
        vars.put("interestProducts", lead.getInterestProducts() == null ? "" :
                lead.getInterestProducts().stream()
                        .map(Enum::name).reduce((a, b) -> a + ", " + b).orElse(""));
        vars.put("planWithinYear",  nz(lead.getPlanWithinYear()));
        vars.put("consultationPreference", nz(lead.getConsultationPreference()));
        vars.put("ruleHits",        String.join(", ", hits));

        String userPrompt = new PromptTemplate(USER_TEMPLATE).render(vars);

        return chatClient.prompt()
                .system(SYSTEM_PROMPT)
                .user(userPrompt)
                .call()
                .entity(LeadScoreResult.class);
    }

    private void applyResult(LeadScore entity, LeadScoreResult r, ScoreSource src, AiStatus status) {
        entity.setGrade(r.grade() == null ? Grade.C : r.grade());
        entity.setScore((short) Math.max(0, Math.min(100, r.score())));
        entity.setNextAction(r.nextAction() == null ? NextAction.NO_ACTION : r.nextAction());
        entity.setReason(r.reason());
        entity.setSource(src);
        entity.setAiStatus(status);
    }

    private static String nz(Enum<?> e) { return e == null ? "" : e.name(); }

    private static String digSatisfaction(Lead l) {
        if (l.getSurveyPayload() == null || l.getSurveyPayload().other() == null
                || l.getSurveyPayload().other().commercial() == null) return "";
        return l.getSurveyPayload().other().commercial().satisfaction() == null
                ? "" : l.getSurveyPayload().other().commercial().satisfaction();
    }

    private static String digComplaints(Lead l) {
        if (l.getSurveyPayload() == null || l.getSurveyPayload().other() == null
                || l.getSurveyPayload().other().commercial() == null
                || l.getSurveyPayload().other().commercial().complaints() == null) return "";
        return String.join(", ", l.getSurveyPayload().other().commercial().complaints());
    }
}
