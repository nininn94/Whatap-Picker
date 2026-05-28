package io.whatap.picker.page;

import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 브라우저가 자동으로 보내는 /favicon.ico 요청을 204 No Content 로 응답.
 * 정적 파일이 없을 때 Spring 6.1+ 의 NoResourceFoundException 이 GlobalExceptionHandler
 * 의 catch-all 로 새서 500 으로 응답되던 문제 회피. (404 핸들러 추가와 별개로 트래픽 노이즈를 줄임.)
 */
@Controller
public class FaviconController {

    @GetMapping("/favicon.ico")
    public ResponseEntity<Void> favicon() {
        return ResponseEntity.noContent().build();
    }
}
