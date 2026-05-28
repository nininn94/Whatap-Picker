package io.whatap.picker.common;

import org.springframework.http.HttpStatus;

public enum ErrorCode {

    VALIDATION_FAILED            (HttpStatus.BAD_REQUEST,  "입력 값이 유효하지 않습니다."),
    UNAUTHORIZED                 (HttpStatus.UNAUTHORIZED, "인증이 필요합니다."),
    FORBIDDEN                    (HttpStatus.FORBIDDEN,    "권한이 없습니다."),
    NOT_FOUND                    (HttpStatus.NOT_FOUND,    "리소스를 찾을 수 없습니다."),
    EVENT_NOT_FOUND              (HttpStatus.NOT_FOUND,    "행사를 찾을 수 없습니다."),
    EVENT_CLOSED                 (HttpStatus.CONFLICT,     "행사가 열려있지 않습니다."),
    EVENT_FORM_LOCKED            (HttpStatus.CONFLICT,     "이미 응답이 시작된 행사는 폼 교체가 불가합니다."),
    PERSONAL_EMAIL_NOT_ALLOWED   (HttpStatus.CONFLICT,     "개인 메일 도메인은 허용되지 않습니다."),
    SURVEY_PAYLOAD_MISMATCH      (HttpStatus.CONFLICT,     "분기 응답이 모니터링 상태와 일치하지 않습니다."),
    CONSENT_REQUIRED             (HttpStatus.CONFLICT,     "필수 동의 항목이 누락되었습니다."),
    ALREADY_DRAWN                (HttpStatus.CONFLICT,     "해당 일자에 이미 추첨에 참여하셨습니다."),
    OUT_OF_STOCK                 (HttpStatus.CONFLICT,     "남은 경품 재고가 없습니다."),
    LOCKED_TEMPLATE              (HttpStatus.CONFLICT,     "시스템 기본 템플릿은 수정할 수 없습니다."),
    SCHEMA_INVALID               (HttpStatus.BAD_REQUEST,  "폼 스키마가 유효하지 않습니다."),
    IN_USE                       (HttpStatus.CONFLICT,     "사용 중인 리소스는 삭제할 수 없습니다."),
    TOO_MANY_REQUESTS            (HttpStatus.TOO_MANY_REQUESTS, "요청이 너무 많습니다. 잠시 후 다시 시도하세요."),
    INTERNAL_ERROR               (HttpStatus.INTERNAL_SERVER_ERROR, "서버 오류가 발생했습니다.");

    private final HttpStatus status;
    private final String defaultMessage;

    ErrorCode(HttpStatus status, String defaultMessage) {
        this.status = status;
        this.defaultMessage = defaultMessage;
    }

    public HttpStatus status() { return status; }
    public String defaultMessage() { return defaultMessage; }
}
