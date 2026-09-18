import type { SettledTrade } from "../types";
import { nowIso } from "../util";

/**
 * Deterministic paper-trading performance metrics.
 *
 * This is the quantitative half of the hackathon score (Sharpe / max-drawdown /
 * win-rate over the competition window). It is a PURE function of the settled
 * trades already persisted in SQLite — no schema change, no external calls, no
 * LLM. Everything here can be recomputed and audited from `data/aether.db`.
 *
 * Honesty choices:
 *  - Sharpe/Sortino are reported PER TRADE (mean/σ of per-trade R), not
 *    annualized. Annualizing needs a trades-per-year assumption we will not
 *    fabricate for a days-long sample.
 *  - We report P&L in USD and in R (risk-normalized), never a total-return %,
 *    because a % needs a fixed starting-equity denominator we do not assume.
 *  - Small samples are labeled, never hidden. `sampleSize` travels with every
 *    figure and `notes` flags when n is too small to be meaningful.
 */

export interface PerfBucket {
  count: number;
  pnlUsd: number;
}

export interface PerformanceReport {
  generatedAt: string;
  sampleSize: number;
  window: { firstClosedAt: string | null; lastClosedAt: string | null };

  wins: number;
  losses: number;
  breakeven: number;
  /** wins / (wins + losses); breakevens excluded. 0 when no decided trades. */
  winRate: number;

  totalPnlUsd: number;
  grossProfitUsd: number;
  /** Negative or zero. */
  grossLossUsd: number;
  /** grossProfit / |grossLoss|. null when there are no losses (undefined ratio). */
  profitFactor: number | null;
  avgWinUsd: number;
  /** Negative or zero. */
  avgLossUsd: number;
  /** Mean P&L per trade (USD). */
  expectancyUsd: number;

  totalR: number;
  avgR: number;

  /** mean(R)/σ(R), sample σ. null when n < 2 or σ = 0 (no dispersion). */
  sharpePerTrade: number | null;
  /** mean(R)/downside-deviation(R). null when n < 2 or no downside. */
  sortinoPerTrade: number | null;

  /** Peak-to-trough of the cumulative-P&L curve. Magnitude, >= 0. */
  maxDrawdownUsd: number;
  /** Same, measured in cumulative R. Magnitude, >= 0. */
  maxDrawdownR: number;

  bestTradeUsd: number;
  worstTradeUsd: number;
  avgHoldMinutes: number;

  byExitReason: Record<string, PerfBucket>;
  byDirection: { LONG: PerfBucket; SHORT: PerfBucket };
  bySymbol: Record<string, PerfBucket & { winRate: number }>;

  /** Cumulative-P&L curve (from a 0 baseline), chronological by close time. */
  equityCurve: { closedAt: string; cumPnlUsd: number; cumR: number }[];

  notes: string[];
}

const MIN_MEANINGFUL = 10;

export function computePerformance(input: SettledTrade[]): PerformanceReport {
  const generatedAt = nowIso();
  const notes: string[] = [];

  if (input.length === 0) {
    return emptyReport(generatedAt, ["No settled trades yet. Metrics populate as the paper loop closes positions."]);
  }

  // Defensive: order chronologically by close time (ISO strings sort correctly).
  const trades = [...input].sort((a, b) => a.closedAt.localeCompare(b.closedAt));
  const n = trades.length;

  const pnls = trades.map((t) => t.pnlUsd);
  const rs = trades.map((t) => t.rMultiple);

  const wins = pnls.filter((p) => p > 0).length;
  const losses = pnls.filter((p) => p < 0).length;
  const breakeven = pnls.filter((p) => p === 0).length;
  const decided = wins + losses;
  const winRate = decided ? wins / decided : 0;

  const totalPnlUsd = sum(pnls);
  const grossProfitUsd = sum(pnls.filter((p) => p > 0));
  const grossLossUsd = sum(pnls.filter((p) => p < 0)); // <= 0
  const profitFactor = grossLossUsd < 0 ? grossProfitUsd / Math.abs(grossLossUsd) : null;
  const avgWinUsd = wins ? grossProfitUsd / wins : 0;
  const avgLossUsd = losses ? grossLossUsd / losses : 0;
  const expectancyUsd = totalPnlUsd / n;

  const totalR = sum(rs);
  const avgR = totalR / n;

  const sd = stdevSample(rs);
  const sharpePerTrade = sd !== null && sd > 0 ? avgR / sd : null;
  const dd = downsideDeviation(rs, 0);
  const sortinoPerTrade = dd !== null && dd > 0 ? avgR / dd : null;

  // Equity curves + peak-to-trough drawdown.
  const equityCurve: PerformanceReport["equityCurve"] = [];
  let cumPnl = 0;
  let cumR = 0;
  let peakPnl = 0;
  let peakR = 0;
  let maxDrawdownUsd = 0;
  let maxDrawdownR = 0;
  for (const t of trades) {
    cumPnl += t.pnlUsd;
    cumR += t.rMultiple;
    peakPnl = Math.max(peakPnl, cumPnl);
    peakR = Math.max(peakR, cumR);
    maxDrawdownUsd = Math.max(maxDrawdownUsd, peakPnl - cumPnl);
    maxDrawdownR = Math.max(maxDrawdownR, peakR - cumR);
    equityCurve.push({ closedAt: t.closedAt, cumPnlUsd: round(cumPnl, 4), cumR: round(cumR, 4) });
  }

  const byExitReason: Record<string, PerfBucket> = {};
  for (const t of trades) {
    const b = (byExitReason[t.exitReason] ??= { count: 0, pnlUsd: 0 });
    b.count += 1;
    b.pnlUsd = round(b.pnlUsd + t.pnlUsd, 4);
  }

  const byDirection = { LONG: { count: 0, pnlUsd: 0 }, SHORT: { count: 0, pnlUsd: 0 } };
  for (const t of trades) {
    const b = byDirection[t.direction];
    b.count += 1;
    b.pnlUsd = round(b.pnlUsd + t.pnlUsd, 4);
  }

  const bySymbol: Record<string, PerfBucket & { winRate: number }> = {};
  const symbolWins: Record<string, number> = {};
  const symbolDecided: Record<string, number> = {};
  for (const t of trades) {
    const b = (bySymbol[t.symbol] ??= { count: 0, pnlUsd: 0, winRate: 0 });
    b.count += 1;
    b.pnlUsd = round(b.pnlUsd + t.pnlUsd, 4);
    if (t.pnlUsd > 0) symbolWins[t.symbol] = (symbolWins[t.symbol] ?? 0) + 1;
    if (t.pnlUsd !== 0) symbolDecided[t.symbol] = (symbolDecided[t.symbol] ?? 0) + 1;
  }
  for (const [sym, b] of Object.entries(bySymbol)) {
    const d = symbolDecided[sym] ?? 0;
    b.winRate = d ? (symbolWins[sym] ?? 0) / d : 0;
  }

  const avgHoldMinutes = mean(trades.map((t) => t.durationMs)) / 60_000;

  if (n < MIN_MEANINGFUL) {
    notes.push(`Sample size ${n} (<${MIN_MEANINGFUL}) — figures are directional, not yet statistically meaningful.`);
  }
  if (sharpePerTrade === null) {
    notes.push("Per-trade Sharpe undefined (need >= 2 trades with dispersion in R).");
  }
  if (profitFactor === null && grossProfitUsd > 0) {
    notes.push("Profit factor undefined — no losing trades in the sample yet.");
  }
  notes.push("Sharpe/Sortino are per-trade (mean/σ of R), not annualized. P&L reported in USD and R; no synthetic return %.");

  return {
    generatedAt,
    sampleSize: n,
    window: { firstClosedAt: trades[0]!.closedAt, lastClosedAt: trades[n - 1]!.closedAt },
    wins,
    losses,
    breakeven,
    winRate: round(winRate, 4),
    totalPnlUsd: round(totalPnlUsd, 4),
    grossProfitUsd: round(grossProfitUsd, 4),
    grossLossUsd: round(grossLossUsd, 4),
    profitFactor: profitFactor === null ? null : round(profitFactor, 4),
    avgWinUsd: round(avgWinUsd, 4),
    avgLossUsd: round(avgLossUsd, 4),
    expectancyUsd: round(expectancyUsd, 4),
    totalR: round(totalR, 4),
    avgR: round(avgR, 4),
    sharpePerTrade: sharpePerTrade === null ? null : round(sharpePerTrade, 4),
    sortinoPerTrade: sortinoPerTrade === null ? null : round(sortinoPerTrade, 4),
    maxDrawdownUsd: round(maxDrawdownUsd, 4),
    maxDrawdownR: round(maxDrawdownR, 4),
    bestTradeUsd: round(Math.max(...pnls), 4),
    worstTradeUsd: round(Math.min(...pnls), 4),
    avgHoldMinutes: round(avgHoldMinutes, 2),
    byExitReason,
    byDirection,
    bySymbol,
    equityCurve,
    notes,
  };
}

function emptyReport(generatedAt: string, notes: string[]): PerformanceReport {
  return {
    generatedAt,
    sampleSize: 0,
    window: { firstClosedAt: null, lastClosedAt: null },
    wins: 0,
    losses: 0,
    breakeven: 0,
    winRate: 0,
    totalPnlUsd: 0,
    grossProfitUsd: 0,
    grossLossUsd: 0,
    profitFactor: null,
    avgWinUsd: 0,
    avgLossUsd: 0,
    expectancyUsd: 0,
    totalR: 0,
    avgR: 0,
    sharpePerTrade: null,
    sortinoPerTrade: null,
    maxDrawdownUsd: 0,
    maxDrawdownR: 0,
    bestTradeUsd: 0,
    worstTradeUsd: 0,
    avgHoldMinutes: 0,
    byExitReason: {},
    byDirection: { LONG: { count: 0, pnlUsd: 0 }, SHORT: { count: 0, pnlUsd: 0 } },
    bySymbol: {},
    equityCurve: [],
    notes,
  };
}

function sum(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0);
}

function mean(xs: number[]): number {
  return xs.length ? sum(xs) / xs.length : 0;
}

/** Sample standard deviation (n-1). null when n < 2. */
function stdevSample(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs);
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/**
 * Downside deviation vs a target (0). Denominator is the FULL sample count, the
 * standard Sortino convention, so adding a winning trade cannot inflate it.
 * null when n < 2.
 */
function downsideDeviation(xs: number[], target: number): number | null {
  if (xs.length < 2) return null;
  const sumSq = xs.reduce((s, x) => {
    const d = Math.min(0, x - target);
    return s + d * d;
  }, 0);
  return Math.sqrt(sumSq / xs.length);
}

function round(x: number, dp: number): number {
  if (!Number.isFinite(x)) return 0;
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
