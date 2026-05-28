package io.whatap.picker.lead.enums;

public enum ConsultationPreference {
    ONSITE_MEETING("방문 컨설팅을 신청합니다."),
    EMAIL_OR_PHONE("메일 혹은 유선으로 자료를 먼저 받아보고 싶습니다.");

    private final String label;
    ConsultationPreference(String label) { this.label = label; }
    public String label() { return label; }
}
