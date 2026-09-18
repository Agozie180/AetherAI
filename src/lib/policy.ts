import type { SessionId } from "./types";

/**
 * Central policy. Session thresholds and risk caps live here — nowhere else.
 * Env vars override file defaults at process start.
 */
export const policy = {
  name: "AetherAI-S2",
  maxLeverage: envNum("AETHER_MAX_LEVERAGE", 5),
  councilSize: 7,
  councilQuorum: envNum("AETHER_COUNCIL_QUORUM", 4),
  riskFraction: 0.005,
  minRewardRisk: 1.5,
  maxSpreadBps: 25,
  maxStaleMarketMs: 15_000,
  maxStaleResearchMin: 360,
  minOrderBookLevels: 5,
  minDepthUsd: 2_000,
  killSwitchLossUsd: 50,
  maxConcurrentPositions: 3,
  // Volatility-shock band as a fraction of price (ATR/price). A new entry is
  // blocked slightly earlier than an already-open position is force-flattened,
  // so a trade taken at the edge of the band is not flattened on the very same
  // tick. This 0.05→0.06 gap is intentional hysteresis, not copy-paste drift.
  atrShockEntryPct: 0.05,
  atrShockFlattenPct: 0.06,
  candleLimit: 200,
  timeframes: ["5m", "15m", "1H", "4H", "1D"] as const,
  sessionConfidence: {
    OFF: 0.65,
    ASIA: 0.68,
    LONDON: 0.7,
    NEW_YORK: 0.68,
    OVERLAP_LONDON_NY: 0.68,
    OVERLAP_ASIA_LONDON: 0.7,
  } as Record<SessionId, number>,
  confidenceWeights: {
    mtf: 0.16,
    regime: 0.1,
    structure: 0.1,
    volume: 0.07,
    vwap: 0.06,
    orderFlow: 0.1,
    cvd: 0.07,
    funding: 0.06,
    volatility: 0.06,
    liquidity: 0.07,
    catalyst: 0.08,
    correlation: 0.04,
    psychology: 0.03,
  },
} as const;

export type Policy = typeof policy;

export function sessionConfidenceThreshold(session: SessionId): number {
  return policy.sessionConfidence[session];
}

function envNum(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
