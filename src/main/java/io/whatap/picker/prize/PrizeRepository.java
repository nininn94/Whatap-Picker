package io.whatap.picker.prize;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface PrizeRepository extends JpaRepository<Prize, UUID> {

    List<Prize> findByEventIdOrderByRankAsc(UUID eventId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Prize p where p.eventId = :eventId and p.remainingQty > 0 order by p.rank asc")
    List<Prize> findRemainingForUpdate(@Param("eventId") UUID eventId);
}
