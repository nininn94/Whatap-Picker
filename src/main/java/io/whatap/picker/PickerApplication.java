package io.whatap.picker;

import io.whatap.picker.lead.LeadProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.retry.annotation.EnableRetry;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@ConfigurationPropertiesScan(basePackages = "io.whatap.picker")
@EnableAsync
@EnableRetry
@EnableScheduling
public class PickerApplication {
    public static void main(String[] args) {
        SpringApplication.run(PickerApplication.class, args);
    }
}
