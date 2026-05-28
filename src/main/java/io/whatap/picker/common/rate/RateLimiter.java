package io.whatap.picker.common.rate;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Simple sliding-window in-memory rate limiter keyed by IP (or any string).
 * MVP 수준 — 단일 JVM 가정. 다중 인스턴스 운영 시 Redis 기반으로 교체.
 */
public class RateLimiter {

    private record Bucket(Instant windowStart, AtomicInteger count) {}

    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();
    private final int maxAttempts;
    private final Duration window;

    public RateLimiter(int maxAttempts, Duration window) {
        this.maxAttempts = maxAttempts;
        this.window = window;
    }

    public boolean tryConsume(String key) {
        Instant now = Instant.now();
        Bucket b = buckets.compute(key, (k, current) -> {
            if (current == null || current.windowStart.plus(window).isBefore(now)) {
                return new Bucket(now, new AtomicInteger(0));
            }
            return current;
        });
        return b.count.incrementAndGet() <= maxAttempts;
    }

    public void reset(String key) {
        buckets.remove(key);
    }

    public int remaining(String key) {
        Bucket b = buckets.get(key);
        if (b == null) return maxAttempts;
        return Math.max(0, maxAttempts - b.count.get());
    }

    public void purgeExpired() {
        Instant cutoff = Instant.now().minus(window);
        buckets.entrySet().removeIf(e -> e.getValue().windowStart.isBefore(cutoff));
    }
}
