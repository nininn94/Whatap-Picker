package io.whatap.picker.page;

import com.fasterxml.jackson.databind.JsonNode;
import io.whatap.picker.event.Event;
import io.whatap.picker.event.EventRepository;
import io.whatap.picker.event.EventStatus;
import io.whatap.picker.form.FormTemplateService;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.view.RedirectView;

@Controller
@RequestMapping("/survey")
public class SurveyPageController {

    private final EventRepository eventRepository;
    private final FormTemplateService formTemplateService;

    public SurveyPageController(EventRepository eventRepository,
                                FormTemplateService formTemplateService) {
        this.eventRepository = eventRepository;
        this.formTemplateService = formTemplateService;
    }

    @GetMapping("/{eventCode}")
    public Object form(@PathVariable String eventCode, Model model) {
        Event event = eventRepository.findByEventCode(eventCode).orElse(null);
        if (event == null) {
            model.addAttribute("eventCode", eventCode);
            return "survey/closed";
        }
        if (event.getStatus() != EventStatus.OPEN) {
            model.addAttribute("eventCode", eventCode);
            model.addAttribute("label", event.getLabel());
            return "survey/closed";
        }

        JsonNode schema = event.getFormSchemaSnapshot();
        if (schema == null) {
            schema = formTemplateService.get(event.getFormTemplateId() != null
                            ? event.getFormTemplateId()
                            : formTemplateService.getSystemDefault().getId())
                    .getSchema();
        }

        model.addAttribute("event", event);
        model.addAttribute("schema", schema);
        return "survey/form";
    }

    @GetMapping("/{eventCode}/complete")
    public String complete(@PathVariable String eventCode, Model model) {
        Event event = eventRepository.findByEventCode(eventCode).orElse(null);
        if (event != null) {
            JsonNode schema = event.getFormSchemaSnapshot();
            if (schema == null && event.getFormTemplateId() != null) {
                schema = formTemplateService.get(event.getFormTemplateId()).getSchema();
            }
            if (schema == null) {
                schema = formTemplateService.getSystemDefault().getSchema();
            }
            model.addAttribute("event", event);
            model.addAttribute("thankYou", schema.path("thankYou"));
        }
        model.addAttribute("eventCode", eventCode);
        return "survey/complete";
    }

    @GetMapping("/{eventCode}/closed")
    public String closed(@PathVariable String eventCode, Model model) {
        model.addAttribute("eventCode", eventCode);
        return "survey/closed";
    }

    @GetMapping("/")
    public RedirectView root() {
        return new RedirectView("/", false);
    }
}
