package io.whatap.picker.lead.enums;

public enum InterestProduct {
    AIOPS("AIOps (AI 기반 운영 모니터링)"),
    LLM_OBSERVABILITY("LLM Observability"),
    RUM("RUM (실제 사용자 모니터링)"),
    NMS("네트워크 관리 모니터링 (NMS)"),
    SERVER("서버 모니터링"),
    GPU("GPU 모니터링"),
    APM("애플리케이션 모니터링"),
    KUBERNETES("쿠버네티스 모니터링"),
    DB("DB 모니터링"),
    LOG("로그 모니터링"),
    SIEM("보안 모니터링 (SIEM)"),
    URL("URL 모니터링"),
    OPEN_METRICS("OpenMetrics");

    private final String label;
    InterestProduct(String label) { this.label = label; }
    public String label() { return label; }
}
