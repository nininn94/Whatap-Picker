package io.whatap.picker.lead.enums;

public enum JobFunction {
    DEVOPS("DevOps"),
    IT_OPS("IT 운영"),
    SRE("SRE"),
    DEVELOPER("개발자 (프론트엔드, 백엔드)"),
    R_AND_D("R&D / 연구원"),
    IT_PLANNING("IT 기획"),
    SECURITY("보안"),
    CONSULTING("컨설팅 (엔지니어)"),
    DATA("데이터"),
    INFRA("전산 / 인프라"),
    MARKETING_SALES("마케팅 / 영업"),
    FINANCE_BACKOFFICE("재무 / 경영지원"),
    EXECUTIVE("임원 / 대표"),
    STUDENT_FREELANCER("학생 / 프리랜서"),
    OTHER("기타");

    private final String label;
    JobFunction(String label) { this.label = label; }
    public String label() { return label; }
}
