package io.whatap.picker.lead.event;

import java.util.UUID;

public record LeadSubmittedEvent(UUID leadId, UUID eventId) {}
