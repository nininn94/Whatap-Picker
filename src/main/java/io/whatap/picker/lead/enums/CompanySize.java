package io.whatap.picker.lead.enums;

public enum CompanySize {
    STARTUP("스타트업 (창업 초기, 매출 ~50억)"),
    SMALL("소기업 (50억~200억)"),
    SME("중소기업 (200억~1000억)"),
    MID("중견기업 (1000억~5000억)"),
    LARGE("대기업 (5000억 이상)"),
    PUBLIC("공기업 및 공공기관"),
    UNKNOWN("정확히 모르겠다");

    private final String label;
    CompanySize(String label) { this.label = label; }
    public String label() { return label; }
}
