package io.whatap.picker.lead.enums;

public enum EmployeeCountRange {
    R_1_50("1-50"),
    R_51_200("51-200"),
    R_201_500("201-500"),
    R_501_1000("501-1000"),
    R_1001_5000("1001-5000"),
    R_5001_PLUS("5001 이상");

    private final String label;
    EmployeeCountRange(String label) { this.label = label; }
    public String label() { return label; }
}
