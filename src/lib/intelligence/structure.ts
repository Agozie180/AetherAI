import type { Candle } from "../types";

export interface StructureSnapshot {
  last: number;
  swingHigh: number;
  swingLow: number;
  support: number;
  resistance: number;
  trend: "up" | "down" | "sideways";
  breakout: "none" | "breakout_high" | "breakout_low" | "failed_high" | "failed_low";
  rangePct: number;
}

export function structureSnapshot(candles: Candle[]): StructureSnapshot {
  if (!candles.length) {
    return {
      last: 0,
      swingHigh: 0,
      swingLow: 0,
      support: 0,
      resistance: 0,
      trend: "sideways",
      breakout: "none",
      rangePct: 0,
    };
  }
  const last = candles.at(-1)!;
  const window = candles.slice(-40);
  const highs = window.map((c) => c.high);
  const lows = window.map((c) => c.low);
  const swingHigh = Math.max(...highs.slice(0, -1));
  const swingLow = Math.min(...lows.slice(0, -1));
  const resistance = percentile(highs, 0.8);
  const support = percentile(lows, 0.2);
  const first = window[0].close;
  const change = first ? (last.close - first) / first : 0;
  const rangePct = last.close ? (swingHigh - swingLow) / last.close : 0;
  let trend: StructureSnapshot["trend"] = "sideways";
  if (change > 0.012 && last.close > support) trend = "up";
  else if (change < -0.012 && last.close < resistance) trend = "down";

  let breakout: StructureSnapshot["breakout"] = "none";
  if (last.close > swingHigh) breakout = "breakout_high";
  else if (last.close < swingLow) breakout = "breakout_low";
  else if (last.high > swingHigh && last.close < swingHigh) breakout = "failed_high";
  else if (last.low < swingLow && last.close > swingLow) breakout = "failed_low";

  return {
    last: last.close,
    swingHigh,
    swingLow,
    support,
    resistance,
    trend,
    breakout,
    rangePct,
  };
}

function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))));
  return s[i];
}
