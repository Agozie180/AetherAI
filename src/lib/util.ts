import { createHash, randomUUID } from "node:crypto";

export function nowIso(): string {
  return new Date().toISOString();
}

export function uid(prefix = "id"): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

export function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function round(n: number, d = 6): number {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

export function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function hash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

export function minutesSince(isoOrMs: string | number): number {
  const t = typeof isoOrMs === "number" ? isoOrMs : Date.parse(isoOrMs);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / 60_000;
}

export function baseTicker(symbol: string): string {
  return symbol.replace(/USDT$/i, "").replace(/^R/i, "");
}

export function isStockPerpSymbol(symbol: string): boolean {
  return /USDT$/i.test(symbol) && !/^R/i.test(symbol);
}
