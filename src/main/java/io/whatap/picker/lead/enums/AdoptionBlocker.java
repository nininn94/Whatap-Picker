package io.whatap.picker.lead.enums;

public enum AdoptionBlocker {
    COST("비용"),
    INTERNAL_PERSUASION("내부 설득"),
    TECH_BURDEN("기술적 부담"),
    EFFECT_UNCERTAIN("효과에 대한 불확실성"),
    NOT_PRIORITY("지금은 우선순위가 아님");

    private final String label;
    AdoptionBlocker(String label) { this.label = label; }
    public String label() { return label; }
}
