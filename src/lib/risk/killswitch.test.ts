import { describe, expect, it } from "vitest";
import { evaluateKillSwitch } from "./killswitch";

describe("kill switch", () => {
  it("trips on stale data and cannot be reasoned away", () => {
    const k = evaluateKillSwitch({
      apiFailures: 0,
      staleMarketMs: 30_000,
      spreadBps: 5,
      maxSpreadBps: 25,
      maxStaleMs: 15_000,
      atrShock: false,
      realizedLossUsd: 0,
      lossLimitUsd: 50,
      failedOrders: 0,
    });
    expect(k.tripped).toBe(true);
    expect(k.reasons.join(" ")).toMatch(/Stale/);
  });
});
