package io.whatap.picker.lead.enums;

public enum Industry {
    FINANCE_INSURANCE("금융 및 보험 서비스"),
    EDUCATION_RESEARCH("교육 및 학술 연구"),
    IT_SERVICES("정보기술(IT) 및 서비스"),
    GOVT_PUBLIC("정부 및 공공 서비스"),
    HEALTHCARE("병원 및 의료 서비스"),
    MANUFACTURING("제조업"),
    RETAIL_ECOMMERCE("소매 및 전자상거래"),
    LOGISTICS("운송 및 물류"),
    LIFE_SCIENCE("헬스케어 및 생명과학(제약/보건/바이오)"),
    TELECOM("통신"),
    MEDIA_ENTERTAINMENT("미디어 및 엔터테인먼트"),
    PROFESSIONAL_SERVICES("전문 서비스 (법률, 회계, 컨설팅)"),
    ENERGY_RESOURCES("에너지 및 자원"),
    HOTEL_TOURISM("호텔 및 관광업"),
    SERVICE_INDUSTRY("서비스업 (식음료 등)"),
    OTHER("기타");

    private final String label;
    Industry(String label) { this.label = label; }
    public String label() { return label; }
}
