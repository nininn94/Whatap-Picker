package io.whatap.picker.admin.dashboard;

import io.whatap.picker.ai.client.LlmGateway;
import io.whatap.picker.common.ApiException;
import io.whatap.picker.common.ErrorCode;
import io.whatap.picker.event.Event;
import io.whatap.picker.event.EventRepository;
import org.springframework.ai.chat.prompt.PromptTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;

@Service
public class MarketingInsightService {

    private static final String SYSTEM_PROMPT = """
            당신은 WhaTap(통합 모니터링 솔루션)의 마케팅 분석가입니다.
            아래 행사 통계를 보고, 마케팅팀이 즉시 활용할 수 있는 인사이트를 작성하세요.

            [작성 형식]
            ## 핵심 요약
            (3~4문장으로 행사 성과·리드 품질·관심 영역을 압축)

            ## 강한 시그널
            - 영업 즉시 접촉 권장 세그먼트 (이유 1줄)
            - 두드러진 관심 제품 / 산업 / 직급
            - 경쟁사 사용·만족도 상황에서 보이는 기회

            ## 약점 / 보완할 점
            - 비율 낮은 세그먼트 또는 부족한 컨버전
            - 후속 마케팅에서 보완할 채널

            ## 다음 액션 제안
            1. ...
            2. ...
            3. ...

            한국어로, 모호한 일반론 대신 숫자 기반으로 구체적으로 작성하세요.
            """;

    private static final String USER_TEMPLATE = """
            [행사 정보]
            - 코드: {eventCode}
            - 라벨: {label}
            - 일자: {eventDate}

            [집계]
            - 총 리드: {leadCount}
            - 추첨 참여: {drawCount}
            - 상담 희망: {wantsConsultationCount}
            - 유효 이메일 비율: {validEmailRatio}

            [세그먼트 (이름:건수)]
            산업: {industry}
            직무: {jobFunction}
            직급: {jobLevel}
            기업규모: {companySize}
            모니터링 상태: {monitoringStatus}

            [관심/도입 의사]
            관심 제품: {interestProducts}
            1년 내 계획: {planWithinYear}
            상담 희망 방식: {consultationPreference}
            망설이는 이유: {adoptionBlocker}

            [모니터링 사용 현황]
            상용툴 사용: {commercialProductUsage}
            오픈소스 사용: {openSourceUsage}
            상용 만족도: {commercialSatisfaction}
            교체 이유: {switchReasons}

            [AI 등급 분포]
            {gradeDistribution}
            """;

    private final EventRepository eventRepository;
    private final LeadAnalyticsService analytics;
    private final LlmGateway llmGateway;

    public MarketingInsightService(EventRepository eventRepository,
                                   LeadAnalyticsService analytics,
                                   LlmGateway llmGateway) {
        this.eventRepository = eventRepository;
        this.analytics = analytics;
        this.llmGateway = llmGateway;
    }

    /**
     * 임의 필터 결과(이미 집계된 통계 묶음)에 대한 인사이트.
     * 리드 페이지 등에서 현재 보고 있는 슬라이스를 그대로 던질 때 사용.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> generateForFiltered(String label, Map<String, Object> stats) {
        StringBuilder ctx = new StringBuilder();
        ctx.append("[필터 결과 라벨] ").append(label == null ? "(미지정)" : label).append('\n');
        stats.forEach((k, v) -> ctx.append("- ").append(k).append(": ").append(v).append('\n'));

        String userPrompt = ctx.toString();
        LlmGateway.Outcome<String> out = llmGateway.completeText(SYSTEM_PROMPT, userPrompt);
        return Map.of(
                "insight",     out.value(),
                "model",       out.modelName(),
                "backend",     out.backend(),
                "generatedAt", OffsetDateTime.now()
        );
    }

    @Transactional(readOnly = true)
    public Map<String, Object> generate(String eventCode, Map<String, Long> gradeDistribution) {
        Event event = (eventCode != null && !eventCode.isBlank())
                ? eventRepository.findByEventCode(eventCode)
                    .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND))
                : null;

        Map<String, Object> summary    = analytics.summary(eventCode);
        Map<String, Object> segments   = analytics.segments(eventCode);
        Map<String, Object> intent     = analytics.intent(eventCode);
        Map<String, Object> monitoring = analytics.monitoring(eventCode);

        Map<String, Object> vars = new HashMap<>();
        vars.put("eventCode", eventCode == null ? "(전체)" : eventCode);
        vars.put("label",     event == null ? "전체 행사" : event.getLabel());
        vars.put("eventDate", event == null ? "-" : String.valueOf(event.getEventDate()));
        vars.put("leadCount",              s(summary.get("leadCount")));
        vars.put("drawCount",              s(summary.get("drawCount")));
        vars.put("wantsConsultationCount", s(summary.get("wantsConsultationCount")));
        vars.put("validEmailRatio",        s(summary.get("validEmailRatio")));
        vars.put("industry",         compact(segments.get("industry")));
        vars.put("jobFunction",      compact(segments.get("jobFunction")));
        vars.put("jobLevel",         compact(segments.get("jobLevel")));
        vars.put("companySize",      compact(segments.get("companySize")));
        vars.put("monitoringStatus", compact(segments.get("monitoringStatus")));
        vars.put("interestProducts",       compact(intent.get("interestProducts")));
        vars.put("planWithinYear",         compact(intent.get("planWithinYear")));
        vars.put("consultationPreference", compact(intent.get("consultationPreference")));
        vars.put("adoptionBlocker",        compact(intent.get("adoptionBlocker")));
        vars.put("commercialProductUsage", compact(monitoring.get("commercialProductUsage")));
        vars.put("openSourceUsage",        compact(monitoring.get("openSourceUsage")));
        vars.put("commercialSatisfaction", compact(monitoring.get("commercialSatisfaction")));
        vars.put("switchReasons",          compact(monitoring.get("switchReasons")));
        vars.put("gradeDistribution",      compact(gradeDistribution));

        String userPrompt = new PromptTemplate(USER_TEMPLATE).render(vars);
        LlmGateway.Outcome<String> out = llmGateway.completeText(SYSTEM_PROMPT, userPrompt);

        return Map.of(
                "eventCode", eventCode,
                "insight", out.value(),
                "model", out.modelName(),
                "backend", out.backend(),
                "generatedAt", OffsetDateTime.now()
        );
    }

    private static String s(Object o) { return o == null ? "0" : o.toString(); }

    @SuppressWarnings("unchecked")
    private static String compact(Object map) {
        if (!(map instanceof Map<?, ?> m)) return "(없음)";
        if (m.isEmpty()) return "(없음)";
        StringBuilder sb = new StringBuilder();
        m.forEach((k, v) -> {
            if (sb.length() > 0) sb.append(", ");
            sb.append(k).append(":").append(v);
        });
        return sb.toString();
    }
}
