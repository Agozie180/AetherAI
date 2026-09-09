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

const quality: DataQuality = { complete: true, missing: [], stale: [], failures: [], freshnessSeconds: {} };

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
      tradeImbalance: 0.1, aggressiveBuyShare: 0.55, cvd: 12, largeTrades: [], whaleNote: "", liquidityNote: "",
      capability: { orderBook: "AVAILABLE", publicFills: "AVAILABLE", cvd: "AVAILABLE", whaleFeed: "UNAVAILABLE", liquidationTape: "UNAVAILABLE", openInterest: "AVAILABLE", funding: "AVAILABLE" },
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
      quality: { complete: false, missing: ["news_headlines"], stale: [], failures: ["SEC: down"], freshnessSeconds: {} },
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
});
