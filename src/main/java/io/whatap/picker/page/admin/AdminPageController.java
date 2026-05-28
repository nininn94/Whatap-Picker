package io.whatap.picker.page.admin;

import io.whatap.picker.common.ApiException;
import io.whatap.picker.common.ErrorCode;
import io.whatap.picker.event.Event;
import io.whatap.picker.event.EventRepository;
import io.whatap.picker.prize.Prize;
import io.whatap.picker.prize.PrizeRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;

import java.util.List;
import java.util.UUID;

@Controller
@RequestMapping("/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminPageController {

    private final EventRepository eventRepository;
    private final PrizeRepository prizeRepository;

    public AdminPageController(EventRepository eventRepository, PrizeRepository prizeRepository) {
        this.eventRepository = eventRepository;
        this.prizeRepository = prizeRepository;
    }

    @GetMapping
    public String home(Model model) {
        model.addAttribute("events", eventRepository.findAll());
        return "admin/home";
    }

    @GetMapping("/events")
    public String events(Model model) {
        model.addAttribute("events", eventRepository.findAll());
        return "admin/events/list";
    }

    @GetMapping("/events/{id}/prizes")
    public String prizes(@PathVariable UUID id, Model model) {
        Event event = eventRepository.findById(id)
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND));
        List<Prize> prizes = prizeRepository.findByEventIdOrderByRankAsc(event.getId());
        model.addAttribute("event", event);
        model.addAttribute("prizes", prizes);
        return "admin/events/prizes";
    }

    @GetMapping("/leads")
    public String leads(Model model) {
        model.addAttribute("events", eventRepository.findAll());
        return "admin/leads/list";
    }

    @GetMapping("/leads/{id}")
    public String leadDetail(@PathVariable UUID id, Model model) {
        model.addAttribute("leadId", id);
        return "admin/leads/detail";
    }

    @GetMapping("/users")
    public String users() {
        return "admin/users/list";
    }

    @GetMapping("/forms")
    public String forms() {
        return "admin/forms/list";
    }

    @GetMapping("/forms/{id}/edit")
    public String formEdit(@PathVariable UUID id, Model model) {
        model.addAttribute("formId", id);
        return "admin/forms/edit";
    }

    @GetMapping("/dashboard")
    public String dashboard(Model model) {
        model.addAttribute("events", eventRepository.findAll());
        return "admin/dashboard";
    }
}
