import { describe, expect, it } from "vitest";
import { similarSetups } from "./similar";
import type { SettledTrade } from "../types";

function trade(i: number, win: boolean): SettledTrade {
  return {
    id: `t${i}`,
    runId: "r",
    symbol: "NVDAUSDT",
    direction: "LONG",
    qty: 1,
    entry: 100,
    stop: 95,
    takeProfit: 110,
    invalidation: "x",
    invalidationPrice: 96,
    leverage: 5,
    mode: "paper",
    clientOid: "c",
    openedAt: new Date().toISOString(),
    thesis: "t",
    regime: "trending",
    session: "LONDON",
    calibrated: 0.7,
    elders: [],
    status: "closed",
    closedAt: new Date().toISOString(),
    exit: win ? 110 : 95,
    exitReason: win ? "take_profit" : "stop_loss",
    rMultiple: win ? 2 : -1,
    pnlUsd: win ? 10 : -5,
    durationMs: 1,
    closeSubmitted: true,
  };
}

describe("similar setups", () => {
  it("refuses to quote accuracy on tiny samples", () => {
    const r = similarSetups({ regime: "trending", session: "LONDON", direction: "LONG" }, [trade(1, true), trade(2, false)]);
    expect(r.settled).toBe(2);
    expect(r.historicalAccuracy).toBe("insufficient sample");
    expect(r.note).toMatch(/insufficient sample/i);
  });

  it("quotes win rate only at 30 settled", () => {
    const settled = Array.from({ length: 30 }, (_, i) => trade(i, i < 18));
    const r = similarSetups({ regime: "trending", session: "LONDON", direction: "LONG" }, settled);
    expect(r.settled).toBe(30);
    expect(r.historicalAccuracy).toBe("60.0%");
  });
});
