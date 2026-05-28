package io.whatap.picker.lead;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LeadRepository extends JpaRepository<Lead, UUID>, JpaSpecificationExecutor<Lead> {

    Optional<Lead> findByPhoneAndEventId(String phone, UUID eventId);

    List<Lead> findByEventIdAndFullNameAndPhoneLast4(UUID eventId, String fullName, String phoneLast4);

    /**
     * 운영자 부스 검색용 — full_name LIKE %name% (대소문자 무시) + phone_last4 일치.
     * 정확 일치보다 부분 일치를 허용해서 "김관진" 만 입력해도 매칭 되도록.
     */
    @Query("SELECT l FROM Lead l " +
           "WHERE l.eventId = :eventId " +
           "AND l.phoneLast4 = :phoneLast4 " +
           "AND LOWER(l.fullName) LIKE LOWER(CONCAT('%', :name, '%'))")
    List<Lead> searchByNameLike(@Param("eventId") UUID eventId,
                                @Param("name") String name,
                                @Param("phoneLast4") String phoneLast4);

    long countByEventId(UUID eventId);

    List<Lead> findByRetentionUntilBefore(LocalDate cutoff);
}
