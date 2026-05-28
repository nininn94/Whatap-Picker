package io.whatap.picker.config;

import io.whatap.picker.auth.AppUser;
import io.whatap.picker.auth.AppUserRepository;
import io.whatap.picker.auth.Role;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class BootstrapAdminRunner implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(BootstrapAdminRunner.class);

    private final AppUserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final String adminUsername;
    private final String adminPassword;

    public BootstrapAdminRunner(AppUserRepository userRepository,
                                PasswordEncoder passwordEncoder,
                                @Value("${bootstrap.admin.username:admin}") String adminUsername,
                                @Value("${bootstrap.admin.password:}") String adminPassword) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.adminUsername = adminUsername;
        this.adminPassword = adminPassword;
    }

    @Override
    public void run(String... args) {
        if (userRepository.existsByUsername(adminUsername)) {
            log.info("Bootstrap admin '{}' already exists, skip seeding.", adminUsername);
            return;
        }
        if (adminPassword == null || adminPassword.isBlank()) {
            throw new IllegalStateException(
                    "BOOTSTRAP_ADMIN_PASSWORD is required to seed the initial admin user.");
        }
        AppUser admin = new AppUser(adminUsername, passwordEncoder.encode(adminPassword), Role.ADMIN);
        userRepository.save(admin);
        log.info("Seeded bootstrap admin user '{}'.", adminUsername);
    }
}
