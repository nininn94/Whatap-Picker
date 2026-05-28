package io.whatap.picker.admin.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record PrizeBulkRequest(
        @NotEmpty @Valid List<Item> prizes
) {
    public record Item(
            @NotNull @Min(1) Short rank,
            @NotBlank String name,
            @NotNull @Min(0) Integer initialQty
    ) {}
}
