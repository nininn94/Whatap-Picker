package io.whatap.picker.form;

import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Component
@Order(20) // BootstrapAdminRunner 이후
public class FormTemplateSeeder implements CommandLineRunner {

    private final FormTemplateService formTemplateService;

    public FormTemplateSeeder(FormTemplateService formTemplateService) {
        this.formTemplateService = formTemplateService;
    }

    @Override
    public void run(String... args) {
        formTemplateService.seedSystemDefaultIfMissing();
    }
}
