import type { Candle, Regime } from "../types";
import { atr } from "./technicals";
import { structureSnapshot } from "./structure";

export interface RegimeSnapshot {
  regime: Regime;
  volatility: "high" | "low" | "normal";
  atrPct: number;
  chop: number;
  rationale: string;
}

export function regimeSnapshot(candles: Candle[]): RegimeSnapshot {
  const last = candles.at(-1)?.close ?? 0;
  const a = atr(candles, 14);
  const atrPct = last ? a / last : 0;
  const struct = structureSnapshot(candles);
  const window = candles.slice(-30);
  const ranges = window.map((c) => (c.close ? (c.high - c.low) / c.close : 0));
  const net = window.length && window[0].close ? Math.abs(window.at(-1)!.close - window[0].close) / window[0].close : 0;
  const path = ranges.reduce((s, x) => s + x, 0);
  const chop = path ? 1 - net / path : 1;

  let volatility: RegimeSnapshot["volatility"] = "normal";
  if (atrPct > 0.025) volatility = "high";
  else if (atrPct < 0.006) volatility = "low";

  let regime: Regime = "transition";
  let rationale = "";
  if (struct.breakout === "breakout_high" || struct.breakout === "breakout_low") {
    regime = "breakout";
    rationale = `Price broke prior swing (${struct.breakout}).`;
  } else if (chop > 0.72 && struct.trend === "sideways") {
    regime = "choppy";
    rationale = "High path length vs net progress — two-sided trade.";
  } else if (struct.trend !== "sideways" && chop < 0.45) {
    regime = volatility === "high" ? "momentum_expansion" : "trending";
    rationale = `Directional (${struct.trend}) with follow-through.`;
  } else if (struct.trend !== "sideways" && chop > 0.65) {
    regime = "momentum_exhaustion";
    rationale = "Trend label but choppiness rising.";
  } else if (volatility === "low" && struct.trend === "sideways") {
    regime = "ranging";
    rationale = "Low ATR, contained swings.";
  } else if (volatility === "high") {
    regime = "high_volatility";
    rationale = `ATR ${ (atrPct * 100).toFixed(2)}% of price.`;
  } else if (volatility === "low") {
    regime = "low_volatility";
    rationale = "Compressed ATR.";
  } else {
    regime = "transition";
    rationale = "Mixed structure; no dominant regime.";
  }

  return { regime, volatility, atrPct, chop, rationale };
}
