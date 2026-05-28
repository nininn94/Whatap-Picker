package io.whatap.picker.ai.enums;

public enum NextAction {
    MEETING_PROPOSAL_24H("24시간 내 영업 미팅 제안"),
    MEETING_PROPOSAL_WEEK("1주 내 미팅 제안"),
    PRODUCT_INTRO_EMAIL("제품 소개 이메일 발송"),
    TECH_CONSULT_EMAIL("기술 컨설팅 안내"),
    NURTURE_NEWSLETTER("뉴스레터 등록 후속"),
    WEBINAR_INVITE("웨비나 초대"),
    NO_ACTION("후속 액션 불필요");

    private final String label;
    NextAction(String label) { this.label = label; }
    public String label() { return label; }
}
