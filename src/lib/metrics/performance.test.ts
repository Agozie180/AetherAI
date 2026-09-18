import { describe, expect, it } from "vitest";
import { computePerformance } from "./performance";
import type { SettledTrade } from "../types";

/** Build a SettledTrade with sane defaults; override only what a case cares about. */
function mk(over: Partial<SettledTrade> & { pnlUsd: number; rMultiple: number; closedAt: string }): SettledTrade {
  return {
    id: over.id ?? `t-${over.closedAt}`,
    runId: "r1",
    symbol: over.symbol ?? "NVDAUSDT",
    direction: over.direction ?? "LONG",
    qty: 1,
    entry: 100,
    stop: 95,
    takeProfit: 110,
    invalidation: "1H close < 95",
    invalidationPrice: 95,
    leverage: 3,
    mode: "paper",
    clientOid: "c1",
    openedAt: "2026-09-16T09:00:00.000Z",
    thesis: "test",
    regime: "trending",
    session: "NEW_YORK",
    calibrated: 0.7,
    elders: [],
    status: "closed",
    closedAt: over.closedAt,
    exit: over.exit ?? 108,
    exitReason: over.exitReason ?? "take_profit",
    rMultiple: over.rMultiple,
    pnlUsd: over.pnlUsd,
    durationMs: over.durationMs ?? 600_000,
    closeSubmitted: true,
  };
}

describe("computePerformance", () => {
  it("returns a well-formed empty report for no trades", () => {
    const r = computePerformance([]);
    expect(r.sampleSize).toBe(0);
    expect(r.winRate).toBe(0);
    expect(r.equityCurve).toEqual([]);
    expect(r.notes.join(" ")).toMatch(/No settled trades/i);
  });

  it("computes counts, PnL, R, drawdown, Sharpe and Sortino from a known sample", () => {
    const trades = [
      mk({ pnlUsd: 100, rMultiple: 2, closedAt: "2026-09-16T10:00:00.000Z" }),
      mk({ pnlUsd: -50, rMultiple: -1, closedAt: "2026-09-16T11:00:00.000Z", exitReason: "stop_loss", exit: 95 }),
      mk({ pnlUsd: 25, rMultiple: 0.5, closedAt: "2026-09-16T12:00:00.000Z" }),
    ];
    const r = computePerformance(trades);

    expect(r.sampleSize).toBe(3);
    expect(r.wins).toBe(2);
    expect(r.losses).toBe(1);
    expect(r.breakeven).toBe(0);
    expect(r.winRate).toBeCloseTo(2 / 3, 3);

    expect(r.totalPnlUsd).toBe(75);
    expect(r.grossProfitUsd).toBe(125);
    expect(r.grossLossUsd).toBe(-50);
    expect(r.profitFactor).toBeCloseTo(2.5, 6);
    expect(r.avgWinUsd).toBeCloseTo(62.5, 6);
    expect(r.avgLossUsd).toBeCloseTo(-50, 6);
    expect(r.expectancyUsd).toBeCloseTo(25, 6);

    expect(r.totalR).toBeCloseTo(1.5, 6);
    expect(r.avgR).toBeCloseTo(0.5, 6);

    // R=[2,-1,0.5]: mean 0.5, sample σ 1.5 → Sharpe 0.3333
    expect(r.sharpePerTrade).toBeCloseTo(0.3333, 3);
    // downside dev = sqrt(1/3)=0.5774 → Sortino 0.8660
    expect(r.sortinoPerTrade).toBeCloseTo(0.8660, 3);

    // cum PnL 100,50,75; peak 100 → maxDD 50. cum R 2,1,1.5; peak 2 → maxDD 1.
    expect(r.maxDrawdownUsd).toBe(50);
    expect(r.maxDrawdownR).toBe(1);

    expect(r.bestTradeUsd).toBe(100);
    expect(r.worstTradeUsd).toBe(-50);
    expect(r.avgHoldMinutes).toBe(10);

    expect(r.equityCurve.map((e) => e.cumPnlUsd)).toEqual([100, 50, 75]);
    expect(r.byDirection.LONG.count).toBe(3);
    expect(r.byExitReason.stop_loss?.count).toBe(1);
    expect(r.bySymbol.NVDAUSDT?.count).toBe(3);
  });

  it("marks profit factor undefined when there are no losses", () => {
    const trades = [
      mk({ pnlUsd: 10, rMultiple: 0.4, closedAt: "2026-09-16T10:00:00.000Z" }),
      mk({ pnlUsd: 20, rMultiple: 0.8, closedAt: "2026-09-16T11:00:00.000Z" }),
    ];
    const r = computePerformance(trades);
    expect(r.profitFactor).toBeNull();
    expect(r.losses).toBe(0);
    expect(r.notes.join(" ")).toMatch(/Profit factor undefined/i);
  });

  it("sorts out-of-order trades by close time before building the equity curve", () => {
    const trades = [
      mk({ pnlUsd: 25, rMultiple: 0.5, closedAt: "2026-09-16T12:00:00.000Z" }),
      mk({ pnlUsd: 100, rMultiple: 2, closedAt: "2026-09-16T10:00:00.000Z" }),
      mk({ pnlUsd: -50, rMultiple: -1, closedAt: "2026-09-16T11:00:00.000Z" }),
    ];
    const r = computePerformance(trades);
    expect(r.equityCurve.map((e) => e.cumPnlUsd)).toEqual([100, 50, 75]);
    expect(r.window.firstClosedAt).toBe("2026-09-16T10:00:00.000Z");
    expect(r.window.lastClosedAt).toBe("2026-09-16T12:00:00.000Z");
  });
});
