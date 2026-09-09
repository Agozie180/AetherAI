import type { OpenPosition, SettledTrade, SessionId } from "../types";
import { listSettled } from "./store";

export interface SimilarReport {
  similar: number;
  settled: number;
  wins: number;
  historicalAccuracy: string;
  note: string;
}

export function similarSetups(
  probe: { regime: string; session: SessionId; direction: string },
  settled: SettledTrade[] = listSettled(),
): SimilarReport {
  const match = settled.filter(
    (t) => t.regime === probe.regime && t.session === probe.session && t.direction === probe.direction,
  );
  const wins = match.filter((t) => t.rMultiple > 0).length;
  const settledN = match.length;
  if (settledN < 30) {
    return {
      similar: match.length,
      settled: settledN,
      wins,
      historicalAccuracy: "insufficient sample",
      note: `Similar setups: ${match.length}. Settled: ${settledN}. Historical accuracy: insufficient sample.`,
    };
  }
  const pct = ((wins / settledN) * 100).toFixed(1);
  return {
    similar: match.length,
    settled: settledN,
    wins,
    historicalAccuracy: `${pct}%`,
    note: `Similar setups: ${match.length}. Settled: ${settledN}. Win rate ${pct}% (not a proven edge).`,
  };
}

export function openConflicts(symbol: string, opens: OpenPosition[]): boolean {
  return opens.some((p) => p.symbol === symbol && p.status === "open");
}
