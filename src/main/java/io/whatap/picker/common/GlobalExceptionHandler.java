package io.whatap.picker.common;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;

import jakarta.validation.ConstraintViolationException;

import java.util.List;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiErrorResponse> handleApi(ApiException ex) {
        return ResponseEntity.status(ex.code().status())
                .body(ApiErrorResponse.of(ex.code(), ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleBind(MethodArgumentNotValidException ex) {
        List<ApiErrorResponse.FieldError> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(this::toFieldError)
                .toList();
        return ResponseEntity.status(ErrorCode.VALIDATION_FAILED.status())
                .body(ApiErrorResponse.of(ErrorCode.VALIDATION_FAILED,
                        ErrorCode.VALIDATION_FAILED.defaultMessage(), errors));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiErrorResponse> handleConstraint(ConstraintViolationException ex) {
        return ResponseEntity.status(ErrorCode.VALIDATION_FAILED.status())
                .body(ApiErrorResponse.of(ErrorCode.VALIDATION_FAILED, ex.getMessage()));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiErrorResponse> handleForbidden(AccessDeniedException ex) {
        return ResponseEntity.status(ErrorCode.FORBIDDEN.status())
                .body(ApiErrorResponse.of(ErrorCode.FORBIDDEN, ex.getMessage()));
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ApiErrorResponse> handleAuth(AuthenticationException ex) {
        return ResponseEntity.status(ErrorCode.UNAUTHORIZED.status())
                .body(ApiErrorResponse.of(ErrorCode.UNAUTHORIZED, ex.getMessage()));
    }

    @ExceptionHandler(NoHandlerFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleNotFound(NoHandlerFoundException ex) {
        return ResponseEntity.status(ErrorCode.NOT_FOUND.status())
                .body(ApiErrorResponse.of(ErrorCode.NOT_FOUND, ex.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleAny(Exception ex) {
        return ResponseEntity.status(ErrorCode.INTERNAL_ERROR.status())
                .body(ApiErrorResponse.of(ErrorCode.INTERNAL_ERROR, ex.getMessage()));
    }

    private ApiErrorResponse.FieldError toFieldError(FieldError fe) {
        return new ApiErrorResponse.FieldError(fe.getField(), fe.getDefaultMessage());
    }
}
