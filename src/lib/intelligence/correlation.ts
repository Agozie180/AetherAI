import type { Candle } from "../types";

export interface CorrelationSnapshot {
  vsBtc: number | null;
  sample: number;
  independent: boolean;
  note: string;
}

export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 10) return null;
  const ax = a.slice(-n);
  const bx = b.slice(-n);
  const ma = ax.reduce((s, x) => s + x, 0) / n;
  const mb = bx.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = ax[i] - ma;
    const y = bx[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const den = Math.sqrt(da * db);
  if (!den) return null;
  return num / den;
}

export function returns(candles: Candle[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const p = candles[i - 1].close;
    if (p) r.push((candles[i].close - p) / p);
  }
  return r;
}

export function correlationSnapshot(asset: Candle[], btc: Candle[]): CorrelationSnapshot {
  const r = pearson(returns(asset), returns(btc));
  const sample = Math.min(asset.length, btc.length);
  const independent = r !== null && Math.abs(r) < 0.35;
  return {
    vsBtc: r,
    sample,
    independent,
    note:
      r === null
        ? "Insufficient overlapping candles for correlation."
        : independent
          ? `Low BTC correlation (${r.toFixed(2)}) — name may be moving on its own. n=${sample}`
          : `BTC correlation ${r.toFixed(2)} (n=${sample}). Not a proven edge.`,
  };
}
