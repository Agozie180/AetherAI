import { beforeEach, describe, expect, it } from "vitest";
import { clientKey, rateLimit, resetRateLimits } from "./ratelimit";

describe("rateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to the limit then blocks within the window", () => {
    const opts = { limit: 3, windowMs: 60_000 };
    expect(rateLimit("k", opts).ok).toBe(true); // 1
    expect(rateLimit("k", opts).ok).toBe(true); // 2
    const third = rateLimit("k", opts); // 3
    expect(third.ok).toBe(true);
    expect(third.remaining).toBe(0);
    const fourth = rateLimit("k", opts); // 4 → blocked
    expect(fourth.ok).toBe(false);
    expect(fourth.retryAfterSec).toBeGreaterThan(0);
  });

  it("tracks keys independently", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect(rateLimit("a", opts).ok).toBe(true);
    expect(rateLimit("a", opts).ok).toBe(false);
    expect(rateLimit("b", opts).ok).toBe(true); // different key unaffected
  });

  it("resets after the window elapses", async () => {
    const opts = { limit: 1, windowMs: 5 };
    expect(rateLimit("w", opts).ok).toBe(true);
    expect(rateLimit("w", opts).ok).toBe(false);
    await new Promise<void>((r) => setTimeout(r, 8));
    expect(rateLimit("w", opts).ok).toBe(true);
  });
});

describe("clientKey", () => {
  it("prefers the first x-forwarded-for hop", () => {
    const req = new Request("https://x.test", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientKey(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip, then a constant", () => {
    expect(clientKey(new Request("https://x.test", { headers: { "x-real-ip": "9.9.9.9" } }))).toBe("9.9.9.9");
    expect(clientKey(new Request("https://x.test"))).toBe("local");
  });
});
