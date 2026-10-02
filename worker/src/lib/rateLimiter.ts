/**
 * A small in-memory sliding-window limiter, keyed by string (an IP here).
 * Process-local on purpose: the API runs as a single container, and this only
 * guards the low-stakes public newsletter endpoint against someone using it
 * to spam inboxes - anything that needs a cross-process guarantee (OTP codes,
 * login) is counted in Postgres instead.
 */
export function createRateLimiter(maxHits: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return {
    /** Records one hit and returns false once `key` is over the limit. */
    allow(key: string, now: number = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= maxHits) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      // Keep the map from growing forever on a long-lived process.
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
      }
      return true;
    },
  };
}
