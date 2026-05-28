package io.whatap.picker.lead.util;

public final class PhoneNormalizer {

    private PhoneNormalizer() {}

    /**
     * 입력에서 +82, 하이픈, 공백을 제거하고 010+8자리 형식으로 정규화.
     * 유효하지 않으면 null 반환.
     */
    public static String normalize(String raw) {
        if (raw == null) return null;
        String digits = raw.replaceAll("[\\s-]", "");
        if (digits.startsWith("+82")) {
            digits = "0" + digits.substring(3);
        } else if (digits.startsWith("82") && digits.length() == 12) {
            digits = "0" + digits.substring(2);
        }
        digits = digits.replaceAll("\\D", "");
        if (digits.matches("^010\\d{8}$")) return digits;
        return null;
    }
}
