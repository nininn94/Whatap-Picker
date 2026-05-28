package io.whatap.picker.page;

import io.whatap.picker.common.ApiException;
import io.whatap.picker.common.ErrorCode;
import io.whatap.picker.event.Event;
import io.whatap.picker.event.EventRepository;
import io.whatap.picker.qr.QrCodeService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;

import java.time.Duration;

@Controller
@RequestMapping("/event/{eventCode}")
public class QrPageController {

    private final EventRepository eventRepository;
    private final QrCodeService qrCodeService;
    private final String publicBaseUrl;

    public QrPageController(EventRepository eventRepository,
                            QrCodeService qrCodeService,
                            @Value("${app.public-base-url}") String publicBaseUrl) {
        this.eventRepository = eventRepository;
        this.qrCodeService = qrCodeService;
        this.publicBaseUrl = publicBaseUrl.replaceAll("/+$", "");
    }

    @GetMapping(value = "/qr.png", produces = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<byte[]> qrPng(@PathVariable String eventCode) {
        Event event = eventRepository.findByEventCode(eventCode)
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND));
        String target = publicBaseUrl + "/survey/" + event.getEventCode();
        byte[] png = qrCodeService.toPng(target, 1024);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofHours(24)).cachePublic())
                .contentType(MediaType.IMAGE_PNG)
                .body(png);
    }

    @GetMapping("/qr")
    public String fullscreen(@PathVariable String eventCode, Model model) {
        Event event = eventRepository.findByEventCode(eventCode)
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND));
        model.addAttribute("event", event);
        model.addAttribute("qrImageUrl", "/event/" + event.getEventCode() + "/qr.png");
        model.addAttribute("surveyUrl", publicBaseUrl + "/survey/" + event.getEventCode());
        return "event/qr-display";
    }
}
