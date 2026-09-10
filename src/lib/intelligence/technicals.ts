import type { Candle } from "../types";
import { mean } from "../util";

export function closes(c: Candle[]): number[] {
  return c.map((x) => x.close);
}

export function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function rsi(values: number[], period = 14): number {
  if (values.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let ag = gains / period;
  let al = losses / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (al === 0) return 100;
  const rs = ag / al;
  return 100 - 100 / (1 + rs);
}

export function macd(values: number[]): { macd: number; signal: number; hist: number } {
  const e12 = ema(values, 12);
  const e26 = ema(values, 26);
  const line = e12.map((v, i) => v - (e26[i] ?? v));
  const sig = ema(line, 9);
  const m = line.at(-1) ?? 0;
  const s = sig.at(-1) ?? 0;
  return { macd: m, signal: s, hist: m - s };
}

export function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1].close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev)));
  }
  if (trs.length < period) return mean(trs);
  // Wilder smoothing (RMA): seed with the SMA of the first `period` true ranges,
  // then fold in each later TR. This is the same smoothing rsi() uses, so the
  // two indicators are now internally consistent.
  let a = mean(trs.slice(0, period));
  for (let i = period; i < trs.length; i++) {
    a = (a * (period - 1) + trs[i]) / period;
  }
  return a;
}

export function bollinger(values: number[], period = 20, k = 2): {
  mid: number;
  upper: number;
  lower: number;
  pctB: number;
  bandwidth: number;
} {
  const slice = values.slice(-period);
  const mid = mean(slice);
  const variance = mean(slice.map((x) => (x - mid) ** 2));
  const sd = Math.sqrt(variance);
  const upper = mid + k * sd;
  const lower = mid - k * sd;
  const last = values.at(-1) ?? mid;
  const pctB = upper === lower ? 0.5 : (last - lower) / (upper - lower);
  return { mid, upper, lower, pctB, bandwidth: mid ? (upper - lower) / mid : 0 };
}

export function vwap(candles: Candle[]): number {
  let pv = 0;
  let vol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    pv += tp * c.volume;
    vol += c.volume;
  }
  return vol ? pv / vol : candles.at(-1)?.close ?? 0;
}

export function rsiDivergence(candles: Candle[]): "bullish" | "bearish" | "none" {
  if (candles.length < 40) return "none";
  const c = closes(candles);
  const look = c.slice(-30);
  const r = look.map((_, i) => rsi(c.slice(0, c.length - 30 + i + 1)));
  const last = look.length - 1;
  const prev = look.length - 8;
  if (prev < 5) return "none";
  const priceLL = look[last] < look[prev] && look[prev] <= Math.min(...look.slice(0, prev));
  const rsiHL = r[last] > r[prev];
  const priceHH = look[last] > look[prev] && look[prev] >= Math.max(...look.slice(0, prev));
  const rsiLH = r[last] < r[prev];
  if (priceLL && rsiHL) return "bullish";
  if (priceHH && rsiLH) return "bearish";
  return "none";
}

export interface TechnicalSnapshot {
  rsi: number;
  rsiDivergence: "bullish" | "bearish" | "none";
  macd: { macd: number; signal: number; hist: number };
  ema20: number;
  ema50: number;
  ema200: number;
  emaStack: "bull" | "bear" | "mixed";
  bollinger: ReturnType<typeof bollinger>;
  atr: number;
  vwap: number;
  aboveVwap: boolean;
  volume: number;
  volumeBaseline: number;
  volumeRatio: number;
  momentum: number;
}

export function technicalSnapshot(candles: Candle[]): TechnicalSnapshot {
  const c = closes(candles);
  const e20 = ema(c, 20).at(-1) ?? c.at(-1) ?? 0;
  const e50 = ema(c, 50).at(-1) ?? e20;
  const e200 = ema(c, Math.min(200, Math.max(c.length - 1, 5))).at(-1) ?? e50;
  const vols = candles.map((x) => x.volume);
  const baseline = mean(vols.slice(-20));
  const volume = vols.at(-1) ?? 0;
  const last = c.at(-1) ?? 0;
  const vw = vwap(candles.slice(-50));
  let emaStack: TechnicalSnapshot["emaStack"] = "mixed";
  if (e20 > e50 && e50 > e200) emaStack = "bull";
  else if (e20 < e50 && e50 < e200) emaStack = "bear";
  const prev = c.at(-6) ?? last;
  return {
    rsi: rsi(c),
    rsiDivergence: rsiDivergence(candles),
    macd: macd(c),
    ema20: e20,
    ema50: e50,
    ema200: e200,
    emaStack,
    bollinger: bollinger(c),
    atr: atr(candles),
    vwap: vw,
    aboveVwap: last >= vw,
    volume,
    volumeBaseline: baseline,
    volumeRatio: baseline ? volume / baseline : 1,
    momentum: prev ? (last - prev) / prev : 0,
  };
}
