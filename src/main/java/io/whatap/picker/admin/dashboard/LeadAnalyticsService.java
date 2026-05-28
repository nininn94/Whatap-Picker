package io.whatap.picker.admin.dashboard;

import io.whatap.picker.draw.DrawHistory;
import io.whatap.picker.draw.DrawHistoryRepository;
import io.whatap.picker.event.Event;
import io.whatap.picker.event.EventRepository;
import io.whatap.picker.lead.EmailRejectionLog;
import io.whatap.picker.lead.EmailRejectionLogRepository;
import io.whatap.picker.lead.Lead;
import io.whatap.picker.lead.LeadRepository;
import io.whatap.picker.lead.enums.InterestProduct;
import io.whatap.picker.prize.Prize;
import io.whatap.picker.prize.PrizeRepository;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class LeadAnalyticsService {

    private final LeadRepository leadRepository;
    private final DrawHistoryRepository drawHistoryRepository;
    private final EventRepository eventRepository;
    private final EmailRejectionLogRepository rejectionRepository;
    private final PrizeRepository prizeRepository;

    public LeadAnalyticsService(LeadRepository leadRepository,
                                DrawHistoryRepository drawHistoryRepository,
                                EventRepository eventRepository,
                                EmailRejectionLogRepository rejectionRepository,
                                PrizeRepository prizeRepository) {
        this.leadRepository = leadRepository;
        this.drawHistoryRepository = drawHistoryRepository;
        this.eventRepository = eventRepository;
        this.rejectionRepository = rejectionRepository;
        this.prizeRepository = prizeRepository;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> summary(String eventCode) {
        Event event = resolveEvent(eventCode);
        List<Lead> leads = leadsOf(event);
        long drawCount = event != null ? drawHistoryRepository.countByEventId(event.getId()) : 0;
        long rejection = event != null ? rejectionRepository.countByEventId(event.getId()) : 0;
        long wantsConsult = leads.stream().filter(Lead::isWantsConsultation).count();
        long denom = leads.size() + rejection;
        double validRatio = denom == 0 ? 1.0 : (double) leads.size() / denom;

        return Map.of(
                "eventCode", event != null ? event.getEventCode() : null,
                "eventDate", event != null ? event.getEventDate() : null,
                "leadCount", leads.size(),
                "drawCount", drawCount,
                "wantsConsultationCount", wantsConsult,
                "emailRejectionCount", rejection,
                "validEmailRatio", Math.round(validRatio * 1000) / 1000.0
        );
    }

    @Transactional(readOnly = true)
    @Cacheable(value = "dashboardTimeline", key = "T(java.util.Objects).hashCode(#from, #to)")
    public Map<String, Object> timeline(LocalDate from, LocalDate to) {
        List<Lead> all = leadRepository.findAll();
        Map<LocalDate, long[]> bucket = new TreeMap<>();
        for (Lead l : all) {
            LocalDate d = l.getCreatedAt().toLocalDate();
            if (from != null && d.isBefore(from)) continue;
            if (to != null && d.isAfter(to)) continue;
            long[] row = bucket.computeIfAbsent(d, k -> new long[3]);
            row[0]++; // submitted
            if (l.isWantsConsultation()) row[2]++;
        }
        for (DrawHistory h : drawHistoryRepository.findAll()) {
            LocalDate d = h.getDrawnAt().toLocalDate();
            if (from != null && d.isBefore(from)) continue;
            if (to != null && d.isAfter(to)) continue;
            long[] row = bucket.computeIfAbsent(d, k -> new long[3]);
            row[1]++;
        }
        List<Map<String, Object>> series = new ArrayList<>();
        for (var e : bucket.entrySet()) {
            series.add(Map.of(
                    "date", e.getKey().toString(),
                    "submitted", e.getValue()[0],
                    "drawn", e.getValue()[1],
                    "consultations", e.getValue()[2]
            ));
        }
        return Map.of("series", series);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> segments(String eventCode) {
        Event event = resolveEvent(eventCode);
        List<Lead> leads = leadsOf(event);
        return Map.of(
                "industry",         groupByEnum(leads, Lead::getIndustry),
                "jobFunction",      groupByEnum(leads, Lead::getJobFunction),
                "jobLevel",         groupByEnum(leads, Lead::getJobLevel),
                "companySize",      groupByEnum(leads, Lead::getCompanySize),
                "monitoringStatus", groupByEnum(leads, Lead::getMonitoringStatus)
        );
    }

    @Transactional(readOnly = true)
    public Map<String, Object> intent(String eventCode) {
        Event event = resolveEvent(eventCode);
        List<Lead> leads = leadsOf(event);

        Map<String, Long> interest = new LinkedHashMap<>();
        for (Lead l : leads) {
            if (l.getInterestProducts() == null) continue;
            for (InterestProduct ip : l.getInterestProducts()) {
                interest.merge(ip.name(), 1L, Long::sum);
            }
        }

        return Map.of(
                "interestProducts", interest,
                "planWithinYear",        groupByEnum(leads, Lead::getPlanWithinYear),
                "consultationPreference", groupByEnum(leads, Lead::getConsultationPreference),
                "adoptionBlocker",        groupByEnum(leads, Lead::getAdoptionBlocker)
        );
    }

    @Transactional(readOnly = true)
    public Map<String, Object> prizes(String eventCode) {
        Event event = resolveEvent(eventCode);
        if (event == null) return Map.of("prizes", List.of());
        List<Prize> prizes = prizeRepository.findByEventIdOrderByRankAsc(event.getId());
        List<Map<String, Object>> mapped = prizes.stream().<Map<String,Object>>map(p -> {
            int awarded = p.getInitialQty() - p.getRemainingQty();
            double burn = p.getInitialQty() == 0 ? 0 : awarded / (double) p.getInitialQty();
            return Map.of(
                    "rank", p.getRank(),
                    "name", p.getName(),
                    "initial", p.getInitialQty(),
                    "remaining", p.getRemainingQty(),
                    "burnRate", Math.round(burn * 1000) / 1000.0
            );
        }).toList();
        long outOfStock = drawHistoryRepository.findAll().stream()
                .filter(h -> h.getEventId().equals(event.getId()))
                .filter(h -> h.getPrizeId() == null)
                .count();
        return Map.of("prizes", mapped, "outOfStockCount", outOfStock);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> monitoring(String eventCode) {
        Event event = resolveEvent(eventCode);
        List<Lead> leads = leadsOf(event);
        Map<String, Long> commercial = new LinkedHashMap<>();
        Map<String, Long> open = new LinkedHashMap<>();
        Map<String, Long> sat = new LinkedHashMap<>();
        Map<String, Long> switchReason = new LinkedHashMap<>();
        for (Lead l : leads) {
            if (l.getSurveyPayload() == null) continue;
            var other = l.getSurveyPayload().other();
            if (other == null) continue;
            if (other.commercialProducts() != null)
                other.commercialProducts().forEach(v -> commercial.merge(v, 1L, Long::sum));
            if (other.openSourceProducts() != null)
                other.openSourceProducts().forEach(v -> open.merge(v, 1L, Long::sum));
            if (other.commercial() != null) {
                if (other.commercial().satisfaction() != null)
                    sat.merge(other.commercial().satisfaction(), 1L, Long::sum);
                if (other.commercial().switchReason() != null)
                    switchReason.merge(other.commercial().switchReason(), 1L, Long::sum);
            }
        }
        return Map.of(
                "commercialProductUsage", commercial,
                "openSourceUsage", open,
                "commercialSatisfaction", sat,
                "switchReasons", switchReason,
                "adoptionBlockers", groupByEnum(leads, Lead::getAdoptionBlocker)
        );
    }

    @Transactional(readOnly = true)
    public Map<String, Object> whatapUsers(String eventCode) {
        Event event = resolveEvent(eventCode);
        List<Lead> leads = leadsOf(event);
        Map<Integer, Long> dist = new TreeMap<>();
        Map<String, Long> needed = new LinkedHashMap<>();
        long total = 0; long sum = 0;
        for (Lead l : leads) {
            if (l.getSurveyPayload() == null || l.getSurveyPayload().whatap() == null) continue;
            int p = l.getSurveyPayload().whatap().proficiency();
            dist.merge(p, 1L, Long::sum);
            total++; sum += p;
            if (l.getSurveyPayload().whatap().neededHelps() != null) {
                l.getSurveyPayload().whatap().neededHelps()
                        .forEach(v -> needed.merge(v, 1L, Long::sum));
            }
        }
        return Map.of(
                "proficiencyDistribution", dist,
                "proficiencyAvg", total == 0 ? 0.0 : Math.round((sum * 10.0) / total) / 10.0,
                "neededHelps", needed
        );
    }

    // ---------------- helpers ----------------
    private Event resolveEvent(String eventCode) {
        if (eventCode == null || eventCode.isBlank()) return null;
        return eventRepository.findByEventCode(eventCode).orElse(null);
    }

    private List<Lead> leadsOf(Event event) {
        if (event == null) return leadRepository.findAll();
        return leadRepository.findAll().stream()
                .filter(l -> l.getEventId().equals(event.getId()))
                .toList();
    }

    private <E extends Enum<E>> Map<String, Long> groupByEnum(List<Lead> leads,
                                                              java.util.function.Function<Lead, E> getter) {
        return leads.stream()
                .map(getter)
                .filter(Objects::nonNull)
                .collect(Collectors.groupingBy(Enum::name, Collectors.counting()));
    }
}
