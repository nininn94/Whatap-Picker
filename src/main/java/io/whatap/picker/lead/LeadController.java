package io.whatap.picker.lead;

import io.whatap.picker.common.ClientIp;
import io.whatap.picker.lead.dto.LeadSubmitRequest;
import io.whatap.picker.lead.dto.LeadSubmitResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/leads")
public class LeadController {

    private final LeadService leadService;

    public LeadController(LeadService leadService) {
        this.leadService = leadService;
    }

    @PostMapping
    public ResponseEntity<LeadSubmitResponse> submit(@Valid @RequestBody LeadSubmitRequest request,
                                                     HttpServletRequest httpRequest) {
        LeadSubmitResponse body = leadService.submit(request, ClientIp.of(httpRequest));
        return ResponseEntity.ok(body);
    }
}
