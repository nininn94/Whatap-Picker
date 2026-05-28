package io.whatap.picker.lead.enums;

public enum MonitoringStatus {
    USING_WHATAP("와탭 사용 중"),
    USING_OTHER("타사 모니터링 혹은 오픈소스 사용 중"),
    NOT_USING("사용하지 않음");

    private final String label;
    MonitoringStatus(String label) { this.label = label; }
    public String label() { return label; }
}
