import { describe, expect, it } from "vitest";
import { planRisk } from "./engine";
import type { Instrument } from "../types";

/**
 * The risk engine sizes real money, so its stop/target math is pinned here.
 *
 * The regression this guards: the LONG structural-stop term used to read
 * `last - support*0 + max(last-support, atrStop)`, which is a *price* (~2x last)
 * rather than a *distance*. With the inputs below that bug produced a stop at
 * 72.5 (a ~27% stop); the corrected symmetric distance puts it at 97.5.
 */

const instrument = {
  symbol: "NVDAUSDT",
  category: "USDT-FUTURES",
  baseCoin: "NVDA",
  quoteCoin: "USDT",
  symbolType: "stock",
  isRwa: true,
  isReality: false,
  status: "online",
  type: "perpetual",
  minLeverage: 1,
  maxLeverage: 20,
  minOrderQty: 0.01,
  minOrderAmount: 5,
  pricePrecision: 2,
  quantityPrecision: 4,
  quantityMultiplier: 0.01,
  makerFeeRate: 0.0002,
  takerFeeRate: 0.0006,
  fundInterval: 8,
  buyLimitPriceRatio: 0.02,
  sellLimitPriceRatio: 0.02,
} as Instrument;

function baseArgs(over: Record<string, unknown> = {}) {
  return {
    instrument,
    last: 100,
    vote: "LONG",
    equityUsd: 10_000,
    technicals: {
      rsi: 55, rsiDivergence: "none", macd: { macd: 0, signal: 0, hist: 0.1 },
      ema20: 100, ema50: 99, ema200: 98, emaStack: "bull",
      bollinger: { mid: 100, upper: 102, lower: 98, pctB: 0.5, bandwidth: 0.04 },
      atr: 1.0, vwap: 99.5, aboveVwap: true, volume: 10, volumeBaseline: 8, volumeRatio: 1.25, momentum: 0.01,
    },
    structure: { last: 100, swingHigh: 110, swingLow: 90, support: 90, resistance: 110, trend: "up", breakout: "none", rangePct: 0.2 },
    micro: {
      spread: 0.04, spreadBps: 4, mid: 100, bidDepth: 5000, askDepth: 4000, imbalance: 0.55, pressure: "bid",
      tradeImbalance: 0.1, aggressiveBuyShare: 0.55, cvd: 12, cvdNote: "", largeTrades: [], whaleNote: "", liquidityNote: "",
      capability: { orderBook: "AVAILABLE", publicFills: "AVAILABLE", cvd: "WINDOW_ONLY", whaleFeed: "UNAVAILABLE", liquidationTape: "UNAVAILABLE", openInterest: "AVAILABLE", funding: "AVAILABLE" },
    },
    regime: { regime: "trending", volatility: "normal", atrPct: 0.01, chop: 0.3, rationale: "t" },
    calibrated: 0.7,
    fundingRate: 0.0001,
    feeRate: 0.0006,
    ...over,
  } as Parameters<typeof planRisk>[0];
}

describe("planRisk", () => {
  it("puts a LONG stop a structural distance below price, not a fraction of price", () => {
    const plan = planRisk(baseArgs());
    expect(plan.allowed).toBe(true);
    // atrStop = 1.0 * 1.6 = 1.6; structStop = max(100-90, 1.6) = 10;
    // stopDist = max(1.6, 10*0.25=2.5, 100*0.004=0.4) = 2.5 → stop = 97.5.
    expect(plan.stop).toBeCloseTo(97.5, 6);
    // The pre-fix bug would have produced ~72.5 here.
    expect(plan.stop).toBeGreaterThan(90);
    expect(plan.takeProfit).toBeCloseTo(103.75, 6); // rr 1.5 → tpDist 3.75
    expect(plan.rewardRisk).toBe(1.5);
    expect(plan.leverage).toBe(5); // min(policy 5, instrument 20)
    expect(plan.estimatedEv).toBeGreaterThan(0);
  });

  it("is symmetric: a mirrored SHORT gets the same stop distance", () => {
    const long = planRisk(baseArgs());
    const short = planRisk(baseArgs({ vote: "SHORT" }));
    expect(short.allowed).toBe(true);
    expect(short.stop).toBeCloseTo(102.5, 6);
    expect(short.takeProfit).toBeCloseTo(96.25, 6);
    // Equidistant structure (support 10 below, resistance 10 above) → equal risk.
    expect(Math.abs(short.stop - 100)).toBeCloseTo(Math.abs(long.stop - 100), 6);
  });

  it("denies a NO_TRADE vote and an invalid price", () => {
    const noTrade = planRisk(baseArgs({ vote: "NO_TRADE" }));
    expect(noTrade.allowed).toBe(false);
    expect(noTrade.stop).toBe(0);

    const badPrice = planRisk(baseArgs({ last: 0 }));
    expect(badPrice.allowed).toBe(false);
  });

  it("denies when the spread is wider than policy allows", () => {
    const plan = planRisk(baseArgs({
      micro: { ...baseArgs().micro, spreadBps: 40 },
    }));
    expect(plan.allowed).toBe(false);
    expect(plan.reason).toMatch(/spread/i);
  });
});
