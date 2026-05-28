package io.whatap.picker.event;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EventRepository extends JpaRepository<Event, UUID> {
    Optional<Event> findByEventCode(String eventCode);
    boolean existsByEventCode(String eventCode);
    List<Event> findByStatusOrderByEventDateDesc(EventStatus status);
}
