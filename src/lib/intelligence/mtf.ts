import type { Candle } from "../types";
import { technicalSnapshot } from "./technicals";
import { structureSnapshot } from "./structure";

export interface TimeframeView {
  interval: string;
  direction: "LONG" | "SHORT" | "NO_TRADE";
  strength: number;
  trend: string;
  rsi: number;
}

export interface MtfSnapshot {
  frames: TimeframeView[];
  agreement: number;
  conflict: boolean;
  confluence: number;
  consensus: "LONG" | "SHORT" | "NO_TRADE";
}

export function mtfSnapshot(candles: Record<string, Candle[]>): MtfSnapshot {
  const order = ["5m", "15m", "1H", "4H", "1D"];
  const frames: TimeframeView[] = order.map((interval) => {
    const c = candles[interval] ?? [];
    const tech = technicalSnapshot(c);
    const st = structureSnapshot(c);
    let direction: TimeframeView["direction"] = "NO_TRADE";
    let strength = 0.4;
    if (st.trend === "up" && tech.emaStack !== "bear") {
      direction = "LONG";
      strength = 0.55 + (tech.aboveVwap ? 0.1 : 0) + (tech.macd.hist > 0 ? 0.1 : 0);
    } else if (st.trend === "down" && tech.emaStack !== "bull") {
      direction = "SHORT";
      strength = 0.55 + (!tech.aboveVwap ? 0.1 : 0) + (tech.macd.hist < 0 ? 0.1 : 0);
    }
    return {
      interval,
      direction,
      strength: Math.min(0.95, strength),
      trend: st.trend,
      rsi: tech.rsi,
    };
  });

  const longs = frames.filter((f) => f.direction === "LONG").length;
  const shorts = frames.filter((f) => f.direction === "SHORT").length;
  const consensus: MtfSnapshot["consensus"] =
    longs >= 3 && longs > shorts ? "LONG" : shorts >= 3 && shorts > longs ? "SHORT" : "NO_TRADE";
  const agreement = Math.max(longs, shorts) / frames.length;
  const conflict = longs > 0 && shorts > 0;
  const confluence = conflict ? agreement * 0.7 : agreement;
  return { frames, agreement, conflict, confluence, consensus };
}
