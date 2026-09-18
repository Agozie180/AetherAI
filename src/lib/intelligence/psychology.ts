import type { Psychology } from "../types";
import { clamp } from "../util";

/**
 * Behavioral-state heuristic. `score` is a deterministic 0..100 index derived
 * from price/funding/flow inputs (RSI, funding, 24h change, book imbalance,
 * volume) — NOT text/news/social sentiment analysis. It is a crowding/regime
 * proxy, carries the lowest confidence weight in the engine, and should be read
 * as "how stretched is positioning," not "what is the market's mood."
 */
export interface PsychologySnapshot {
  state: Psychology;
  score: number;
  rationale: string;
}

export function psychologySnapshot(args: {
  rsi: number;
  fundingRate: number;
  volumeRatio: number;
  change24h: number;
  imbalance: number;
}): PsychologySnapshot {
  const { rsi, fundingRate, volumeRatio, change24h, imbalance } = args;
  let score = 50;
  score += (rsi - 50) * 0.6;
  score += fundingRate * 8000;
  score += change24h * 80;
  score += (imbalance - 0.5) * 20;
  if (volumeRatio > 1.8) score += change24h > 0 ? 6 : -6;
  // The terms above are individually unbounded (funding and 24h change have no
  // fixed range), so pin this behavioral index to a real 0..100 scale. This is
  // a positioning/crowding proxy, not a text-sentiment score.
  score = clamp(score, 0, 100);

  let state: Psychology = "neutral";
  let rationale = "Balanced RSI/funding/flow.";
  if (rsi > 78 && fundingRate > 0.0005 && change24h > 0.04) {
    state = "euphoria";
    rationale = "Stretched RSI, longs paying funding, sharp upside.";
  } else if (rsi > 70 && fundingRate > 0.0002) {
    state = "extreme_greed";
    rationale = "Overbought with positive funding — crowded long risk.";
  } else if (rsi > 62) {
    state = "greed";
    rationale = "RSI elevated.";
  } else if (rsi < 22 && change24h < -0.05) {
    state = "capitulation";
    rationale = "Washed-out RSI with a large drop.";
  } else if (rsi < 28 && volumeRatio > 1.6) {
    state = "panic";
    rationale = "Oversold with volume spike.";
  } else if (rsi < 38) {
    state = "fear";
    rationale = "RSI depressed.";
  } else if (Math.abs(fundingRate) > 0.0008) {
    state = "crowded";
    rationale = "Funding extreme versus mid-range RSI.";
  }

  return { state, score, rationale };
}
