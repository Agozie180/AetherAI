import { describe, expect, it } from "vitest";
import { computeConfidence } from "./engine";
import type { MtfSnapshot } from "../intelligence/mtf";
import type { DataQuality } from "../types";

const baseMtf: MtfSnapshot = {
  frames: [],
  agreement: 0.8,
  conflict: false,
  confluence: 0.8,
  consensus: "LONG",
};

const quality: DataQuality = { complete: true, missing: [], stale: [], failures: [], freshnessSeconds: {}, freshSubstantive: 3 };

function stub(over: Record<string, unknown> = {}) {
  return computeConfidence({
    mtf: baseMtf,
    regime: { regime: "trending", volatility: "normal", atrPct: 0.01, chop: 0.3, rationale: "t" },
    structure: { last: 1, swingHigh: 2, swingLow: 0.5, support: 0.8, resistance: 1.2, trend: "up", breakout: "none", rangePct: 0.05 },
    technicals: {
      rsi: 55, rsiDivergence: "none", macd: { macd: 0, signal: 0, hist: 0.1 },
      ema20: 1, ema50: 0.9, ema200: 0.8, emaStack: "bull",
      bollinger: { mid: 1, upper: 1.1, lower: 0.9, pctB: 0.5, bandwidth: 0.2 },
      atr: 0.02, vwap: 0.99, aboveVwap: true, volume: 10, volumeBaseline: 8, volumeRatio: 1.2, momentum: 0.01,
    },
    micro: {
      spread: 0.01, spreadBps: 4, mid: 1, bidDepth: 5000, askDepth: 4000, imbalance: 0.56, pressure: "bid",
      tradeImbalance: 0.1, aggressiveBuyShare: 0.55, cvd: 12, cvdNote: "", largeTrades: [], whaleNote: "", liquidityNote: "",
      capability: { orderBook: "AVAILABLE", publicFills: "AVAILABLE", cvd: "WINDOW_ONLY", whaleFeed: "UNAVAILABLE", liquidationTape: "UNAVAILABLE", openInterest: "AVAILABLE", funding: "AVAILABLE" },
    },
    fundingRate: 0.0001,
    catalyst: { classification: "known", labels: ["earnings_or_filing"], supporting: [], rationale: "x" },
    correlation: { vsBtc: 0.2, sample: 40, independent: true, note: "" },
    psychology: { state: "neutral", score: 50, rationale: "" },
    session: "LONDON",
    quality,
    sampleTrades: 40,
    ...over,
  } as Parameters<typeof computeConfidence>[0]);
}

describe("confidence", () => {
  it("never lets hidden negative adjustments disappear", () => {
    const c = stub({
      quality: { complete: false, missing: ["news_headlines"], stale: [], failures: ["SEC: down"], freshnessSeconds: {}, freshSubstantive: 0 },
      mtf: { ...baseMtf, conflict: true, confluence: 0.5, consensus: "LONG" },
      sampleTrades: 3,
    });
    expect(c.adjustments.length).toBeGreaterThan(0);
    expect(c.adjustments.every((a) => a.reason.length > 0)).toBe(true);
    expect(c.calibrated).toBeLessThan(c.raw);
  });

  it("is a formula not a free-form number", () => {
    const a = stub();
    const b = stub();
    expect(a.raw).toBeCloseTo(b.raw, 8);
  });

  it("credits a proven historical edge only once the sample is large enough", () => {
    // Small sample: sample_size penalty, never a historical_edge credit.
    const small = stub({ sampleTrades: 10, historicalWinRate: 0.9 });
    expect(small.adjustments.find((a) => a.name === "historical_edge")).toBeUndefined();
    expect(small.adjustments.find((a) => a.name === "sample_size")).toBeDefined();

    // Large sample, winning edge: bounded positive adjustment, no penalty.
    const winning = stub({ sampleTrades: 40, historicalWinRate: 0.72 });
    const up = winning.adjustments.find((a) => a.name === "historical_edge");
    expect(up).toBeDefined();
    expect(up!.delta).toBeGreaterThan(0);
    expect(up!.delta).toBeLessThanOrEqual(0.08);
    expect(winning.adjustments.find((a) => a.name === "sample_size")).toBeUndefined();

    // Large sample, losing edge: negative, bounded, and it drags calibrated < raw.
    const losing = stub({ sampleTrades: 40, historicalWinRate: 0.28 });
    const down = losing.adjustments.find((a) => a.name === "historical_edge");
    expect(down).toBeDefined();
    expect(down!.delta).toBeLessThan(0);
    expect(down!.delta).toBeGreaterThanOrEqual(-0.08);
  });

  it("stays backward-compatible when no win rate is supplied", () => {
    // Large sample but no historicalWinRate: neither penalty nor credit.
    const c = stub({ sampleTrades: 40 });
    expect(c.adjustments.find((a) => a.name === "historical_edge")).toBeUndefined();
    expect(c.adjustments.find((a) => a.name === "sample_size")).toBeUndefined();
  });

  it("penalizes directional council disagreement in the final trace", () => {
    const aligned = stub({ councilAgreement: 1, councilDirectionalVotes: 7 });
    const split = stub({ councilAgreement: 4 / 7, councilDirectionalVotes: 5 });
    expect(split.adjustments.find((a) => a.name === "council_disagreement")).toBeDefined();
    expect(split.calibrated).toBeLessThan(aligned.calibrated);
  });
});
