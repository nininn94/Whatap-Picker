package io.whatap.picker.lead;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@ConfigurationProperties(prefix = "lead")
public record LeadProperties(
        List<String> blockedEmailDomains,
        int retentionMonths
) {}
