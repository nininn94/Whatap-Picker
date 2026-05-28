package io.whatap.picker.lead.enums;

public enum PlanWithinYear {
    A_OPEN("현재 구체적인 계획이 없으나 조건에 따라 검토 가능"),
    B_EXPAND("기존 솔루션을 확장하거나 추가 도입을 검토 중"),
    C_REPLACE("현재 솔루션을 교체할 예정"),
    D_NEW_ADOPT("새로운 모니터링 솔루션을 도입할 예정");

    private final String label;
    PlanWithinYear(String label) { this.label = label; }
    public String label() { return label; }
}
