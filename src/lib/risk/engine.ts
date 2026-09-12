import { policy } from "../policy";
import type { Instrument, Vote } from "../types";
import { clamp, round } from "../util";
import type { StructureSnapshot } from "../intelligence/structure";
import type { TechnicalSnapshot } from "../intelligence/technicals";
import type { MicrostructureSnapshot } from "../intelligence/microstructure";
import type { RegimeSnapshot } from "../intelligence/regime";

export interface RiskPlan {
  allowed: boolean;
  reason: string;
  leverage: number;
  qty: number;
  notional: number;
  stop: number;
  takeProfit: number;
  extraTargets: { name: string; price: number; note: string }[];
  rewardRisk: number;
  invalidation: string;
  stopWhy: string;
  tpWhy: string;
  estimatedEv: number;
}

export function planRisk(args: {
  instrument: Instrument;
  last: number;
  vote: Vote;
  equityUsd: number;
  technicals: TechnicalSnapshot;
  structure: StructureSnapshot;
  micro: MicrostructureSnapshot;
  regime: RegimeSnapshot;
  calibrated: number;
  fundingRate: number;
  feeRate: number;
  availableUsdt?: number;
}): RiskPlan {
  const { instrument, last, vote } = args;
  if (vote === "NO_TRADE" || last <= 0) {
    return deny("No directional vote or invalid price.");
  }
  const cap = Math.min(policy.maxLeverage, instrument.maxLeverage);
  const leverage = Math.max(instrument.minLeverage, Math.min(cap, policy.maxLeverage));

  const atrStop = args.technicals.atr * (args.regime.volatility === "high" ? 2.2 : 1.6);
  // Structural stop distance: how far price sits from the level that would
  // invalidate the trade (support for longs, resistance for shorts), floored by
  // the ATR stop. Both branches are distances so downstream sizing is symmetric.
  const structStop =
    vote === "LONG"
      ? Math.max(last - args.structure.support, atrStop)
      : Math.max(args.structure.resistance - last, atrStop);

  const stopDist = Math.max(atrStop, structStop * 0.25, last * 0.004);
  const stop = vote === "LONG" ? last - stopDist : last + stopDist;
  const rr = policy.minRewardRisk;
  const tpDist = stopDist * rr;
  const takeProfit = vote === "LONG" ? last + tpDist : last - tpDist;

  const extraTargets = [
    {
      name: "TP2",
      price: round(vote === "LONG" ? last + tpDist * 1.6 : last - tpDist * 1.6, instrument.pricePrecision),
      note: "Not a native Bitget 3-bracket. Would require a separate reduce-only order after TP1.",
    },
  ];

  const riskUsd = args.equityUsd * policy.riskFraction;
  const qtyRaw = stopDist > 0 ? riskUsd / stopDist : 0;
  const step = instrument.quantityMultiplier || 0.01;
  let qty = Math.floor(qtyRaw / step) * step;
  qty = Math.max(instrument.minOrderQty, qty);
  const notional = qty * last;
  const realizedRiskUsd = stopDist * qty;
  if (realizedRiskUsd > riskUsd * 1.01) {
    return deny(`Minimum exchange quantity risks ${realizedRiskUsd.toFixed(2)}, above policy budget ${riskUsd.toFixed(2)}.`);
  }
  if (typeof args.availableUsdt === "number" && args.availableUsdt > 0 &&
      notional > args.availableUsdt * leverage) {
    return deny(`Notional ${notional.toFixed(2)} exceeds available margin at ${leverage}x leverage.`);
  }
  if (notional < instrument.minOrderAmount) {
    return deny(`Notional ${notional.toFixed(2)} below minOrderAmount ${instrument.minOrderAmount}.`);
  }
  if (args.micro.spreadBps > policy.maxSpreadBps) {
    return deny(`Spread ${args.micro.spreadBps.toFixed(2)} bps exceeds policy ${policy.maxSpreadBps}.`);
  }

  const winP = clamp(0.35 + args.calibrated * 0.35, 0.2, 0.75);
  const fee = args.feeRate * 2 * notional;
  const funding = Math.abs(args.fundingRate) * notional;
  const slip = (args.micro.spreadBps / 10_000) * notional;
  const gain = tpDist * qty;
  const loss = stopDist * qty;
  const estimatedEv = winP * gain - (1 - winP) * loss - fee - funding - slip;

  if (estimatedEv <= 0) {
    return deny(`Expected value ${estimatedEv.toFixed(4)} is not positive after fees/funding/spread.`);
  }

  const invalidation =
    vote === "LONG"
      ? `Long thesis invalidated on a ${args.regime.regime} close below structure ${args.structure.support.toFixed(4)} (stop ${stop.toFixed(4)} is execution, not the thesis).`
      : `Short thesis invalidated on a ${args.regime.regime} close above structure ${args.structure.resistance.toFixed(4)}.`;

  return {
    allowed: true,
    reason: "Risk gate passed.",
    leverage,
    qty: round(qty, instrument.quantityPrecision),
    notional: round(notional, 2),
    stop: round(stop, instrument.pricePrecision),
    takeProfit: round(takeProfit, instrument.pricePrecision),
    extraTargets,
    rewardRisk: rr,
    invalidation,
    stopWhy: `ATR ${args.technicals.atr.toFixed(4)} and structure ${vote === "LONG" ? "support" : "resistance"} — not a fixed percent.`,
    tpWhy: `Target at ${rr}:1 versus stop distance, clipped to current regime ${args.regime.regime}.`,
    estimatedEv: round(estimatedEv, 4),
  };
}

function deny(reason: string): RiskPlan {
  return {
    allowed: false,
    reason,
    leverage: 1,
    qty: 0,
    notional: 0,
    stop: 0,
    takeProfit: 0,
    extraTargets: [],
    rewardRisk: 0,
    invalidation: reason,
    stopWhy: "",
    tpWhy: "",
    estimatedEv: 0,
  };
}
