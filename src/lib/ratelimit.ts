/**
 * Minimal in-memory fixed-window rate limiter. Per-process only — it resets on
 * restart and is not shared across serverless instances, so it is a courtesy
 * guard against casual abuse of the public demo endpoints (notably the
 * LLM-backed /api/ask, which otherwise lets an anonymous caller spend the
 * operator's provider budget), not a production edge limiter. It adds no
 * dependency and cannot itself fail a request.
 */

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
}

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 10_000;

export function rateLimit(key: string, opts: { limit: number; windowMs: number }): RateLimitResult {
  const now = Date.now();
  // Opportunistic sweep so a stream of unique keys (IPs) cannot grow the map
  // without bound. O(n) but only when we are already over the cap.
  if (buckets.size > MAX_TRACKED_KEYS) {
    for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    const resetAt = now + opts.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: Math.max(0, opts.limit - 1), resetAt, retryAfterSec: Math.ceil(opts.windowMs / 1000) };
  }
  b.count += 1;
  const ok = b.count <= opts.limit;
  return {
    ok,
    remaining: Math.max(0, opts.limit - b.count),
    resetAt: b.resetAt,
    retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
  };
}

/** Best-effort client key from proxy headers; falls back to a constant. */
export function clientKey(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "local";
}

/** Test/maintenance hook: drop all tracked buckets. */
export function resetRateLimits(): void {
  buckets.clear();
}
