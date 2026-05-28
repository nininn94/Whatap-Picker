package io.whatap.picker.lead.enums;

public enum JobLevel {
    TOP_EXECUTIVE("최종 결정자 (대표/임원)"),
    SENIOR_MGR("상위 관리자 (부장급)"),
    MID_MGR("중간 관리자 (차/과장급)"),
    STAFF("실무자"),
    OTHER("기타");

    private final String label;
    JobLevel(String label) { this.label = label; }
    public String label() { return label; }
}
