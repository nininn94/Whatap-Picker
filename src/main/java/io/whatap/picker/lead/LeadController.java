package io.whatap.picker.lead;

import io.whatap.picker.common.ClientIp;
import io.whatap.picker.lead.dto.LeadSearchResponse;
import io.whatap.picker.lead.dto.LeadSubmitRequest;
import io.whatap.picker.lead.dto.LeadSubmitResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/leads")
public class LeadController {

    private final LeadService leadService;
    private final LeadSearchService leadSearchService;

    public LeadController(LeadService leadService, LeadSearchService leadSearchService) {
        this.leadService = leadService;
        this.leadSearchService = leadSearchService;
    }

    @PostMapping
    public ResponseEntity<LeadSubmitResponse> submit(@Valid @RequestBody LeadSubmitRequest request,
                                                     HttpServletRequest httpRequest) {
        LeadSubmitResponse body = leadService.submit(request, ClientIp.of(httpRequest));
        return ResponseEntity.ok(body);
    }

    @GetMapping("/search")
    public LeadSearchResponse search(@RequestParam String name,
                                     @RequestParam String phoneLast4,
                                     @RequestParam String eventCode) {
        return leadSearchService.search(name, phoneLast4, eventCode);
    }
}
