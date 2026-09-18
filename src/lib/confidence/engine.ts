import { policy } from "../policy";
import type { ConfidenceTrace, SessionId } from "../types";
import { clamp } from "../util";
import type { CatalystReport } from "../research/catalyst";
import { scoreCatalystForConfidence } from "../research/catalyst";
import type { CorrelationSnapshot } from "../intelligence/correlation";
import type { MicrostructureSnapshot } from "../intelligence/microstructure";
import type { MtfSnapshot } from "../intelligence/mtf";
import type { PsychologySnapshot } from "../intelligence/psychology";
import type { RegimeSnapshot } from "../intelligence/regime";
import type { StructureSnapshot } from "../intelligence/structure";
import type { TechnicalSnapshot } from "../intelligence/technicals";
import type { DataQuality } from "../types";

export function computeConfidence(input: {
  mtf: MtfSnapshot;
  regime: RegimeSnapshot;
  structure: StructureSnapshot;
  technicals: TechnicalSnapshot;
  micro: MicrostructureSnapshot;
  fundingRate: number;
  catalyst: CatalystReport;
  correlation: CorrelationSnapshot;
  psychology: PsychologySnapshot;
  session: SessionId;
  quality: DataQuality;
  sampleTrades: number;
  councilAgreement?: number;
  councilDirectionalVotes?: number;
  /** Realized win rate (0..1) of similar historical setups. Only supplied — and
   *  only trusted — once the settled sample is large enough (>= 30). */
  historicalWinRate?: number;
}): ConfidenceTrace {
  const w = policy.confidenceWeights;
  const mtfScore =
    input.mtf.consensus === "NO_TRADE" ? 0.35 : input.mtf.confluence;
  const regimeScore = regimeScoreMap(input.regime);
  const structureScore =
    input.structure.trend === "sideways"
      ? 0.4
      : input.structure.breakout.startsWith("failed")
        ? 0.35
        : 0.62;
  const volumeScore = clamp(input.technicals.volumeRatio / 2, 0, 1);
  const vwapScore = input.technicals.aboveVwap
    ? input.mtf.consensus === "SHORT"
      ? 0.35
      : 0.65
    : input.mtf.consensus === "LONG"
      ? 0.35
      : 0.65;
  const flowScore = clamp(0.5 + input.micro.tradeImbalance * 0.5, 0, 1);
  const cvdScore = clamp(0.5 + Math.tanh(input.micro.cvd / 50) * 0.4, 0, 1);
  const fundingScore =
    Math.abs(input.fundingRate) > 0.0008 ? 0.35 : Math.abs(input.fundingRate) > 0.0003 ? 0.45 : 0.58;
  const volScore =
    input.regime.volatility === "high" ? 0.4 : input.regime.volatility === "low" ? 0.55 : 0.6;
  const liqScore = clamp(1 - input.micro.spreadBps / policy.maxSpreadBps, 0, 1);
  const catScore = scoreCatalystForConfidence(input.catalyst);
  const corrScore = input.correlation.independent ? 0.62 : 0.5;
  const psyScore = input.psychology.state === "euphoria" || input.psychology.state === "capitulation" ? 0.3 : 0.52;

  const components = [
    { name: "mtf", score: mtfScore, weight: w.mtf },
    { name: "regime", score: regimeScore, weight: w.regime },
    { name: "structure", score: structureScore, weight: w.structure },
    { name: "volume", score: volumeScore, weight: w.volume },
    { name: "vwap", score: vwapScore, weight: w.vwap },
    { name: "orderFlow", score: flowScore, weight: w.orderFlow },
    { name: "cvd", score: cvdScore, weight: w.cvd },
    { name: "funding", score: fundingScore, weight: w.funding },
    { name: "volatility", score: volScore, weight: w.volatility },
    { name: "liquidity", score: liqScore, weight: w.liquidity },
    { name: "catalyst", score: catScore, weight: w.catalyst },
    { name: "correlation", score: corrScore, weight: w.correlation },
    { name: "psychology", score: psyScore, weight: w.psychology },
  ];
  const raw = components.reduce((s, c) => s + c.score * c.weight, 0);

  const adjustments: ConfidenceTrace["adjustments"] = [];
  const miss = input.quality.missing.length + input.quality.failures.length;
  if (miss) {
    adjustments.push({
      name: "data_completeness",
      delta: -0.06 * miss,
      reason: `Missing/failed sources: ${[...input.quality.missing, ...input.quality.failures].slice(0, 4).join("; ")}`,
    });
  }
  const staleCount = input.quality.stale.length;
  if (staleCount) {
    // Sources we have but that are past their freshness window. Distinct from
    // missing/failed data: the evidence exists but may no longer be true, so it
    // shaves confidence rather than removing a component outright.
    adjustments.push({
      name: "data_staleness",
      delta: -Math.min(0.09, 0.03 * staleCount),
      reason: `Stale source(s): ${input.quality.stale.slice(0, 4).join("; ")}`,
    });
  }
  if (input.mtf.conflict) {
    adjustments.push({ name: "mtf_conflict", delta: -0.08, reason: "Timeframes disagree." });
  }
  if (typeof input.councilAgreement === "number") {
    const agreement = clamp(input.councilAgreement, 0, 1);
    const directional = input.councilDirectionalVotes ?? 0;
    if (directional > 0 && agreement < 0.75) {
      adjustments.push({
        name: "council_disagreement",
        delta: -Math.min(0.1, (0.75 - agreement) * 0.25),
        reason: `Council agreement ${(agreement * 100).toFixed(1)}% across ${directional} directional vote(s).`,
      });
    }
  }
  if (input.micro.pressure === "bid" && input.mtf.consensus === "SHORT") {
    adjustments.push({ name: "flow_conflict", delta: -0.05, reason: "Book bid-heavy vs short consensus." });
  }
  if (input.micro.pressure === "ask" && input.mtf.consensus === "LONG") {
    adjustments.push({ name: "flow_conflict", delta: -0.05, reason: "Book ask-heavy vs long consensus." });
  }
  if (input.session === "OFF") {
    adjustments.push({ name: "session", delta: -0.03, reason: "Off-session liquidity typically thinner." });
  }
  if (input.sampleTrades < 30) {
    adjustments.push({
      name: "sample_size",
      delta: -0.04,
      reason: `Historical sample ${input.sampleTrades} — not a proven edge.`,
    });
  } else if (typeof input.historicalWinRate === "number") {
    // Sample is now statistically meaningful: let the realized win rate of
    // similar setups feed back into confidence, bounded so a hot streak can
    // never dominate the deterministic evidence. This closes the loop the
    // "self-improvement" logging was always writing toward.
    const edge = clamp((input.historicalWinRate - 0.5) * 0.3, -0.08, 0.08);
    adjustments.push({
      name: "historical_edge",
      delta: edge,
      reason: `Win rate ${(input.historicalWinRate * 100).toFixed(0)}% over ${input.sampleTrades} similar settled trades.`,
    });
  }
  if (input.regime.regime === "choppy") {
    adjustments.push({ name: "regime", delta: -0.07, reason: "Choppy regime raises false-break risk." });
  }

  const calibrated = clamp(
    raw + adjustments.reduce((s, a) => s + a.delta, 0),
    0,
    0.99,
  );
  return { raw, calibrated, components, adjustments };
}

function regimeScoreMap(r: RegimeSnapshot): number {
  switch (r.regime) {
    case "trending":
    case "momentum_expansion":
    case "breakout":
      return 0.68;
    case "ranging":
    case "low_volatility":
      return 0.48;
    case "choppy":
    case "momentum_exhaustion":
      return 0.32;
    case "high_volatility":
      return 0.4;
    default:
      return 0.45;
  }
}
