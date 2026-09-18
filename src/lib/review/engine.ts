import type { SettledTrade, TradeReview } from "../types";
import { listSettled } from "../memory/store";
import { nowIso } from "../util";

export function rMultiple(args: { direction: "LONG" | "SHORT"; entry: number; exit: number; stop: number }): number {
  const risk = args.direction === "LONG" ? args.entry - args.stop : args.stop - args.entry;
  if (risk <= 0) return 0;
  const reward = args.direction === "LONG" ? args.exit - args.entry : args.entry - args.exit;
  return reward / risk;
}

export function reviewTrade(trade: SettledTrade, ctx?: { regimeNow?: string }): TradeReview {
  const directionCorrect =
    (trade.direction === "LONG" && trade.exit > trade.entry) ||
    (trade.direction === "SHORT" && trade.exit < trade.entry);
  const settled = listSettled();
  const sampleSize = settled.length;
  const eldersRight = trade.elders.filter((e) => e.vote === trade.direction).map((e) => e.elder);
  const eldersWrong = trade.elders.filter((e) => e.vote !== trade.direction && e.vote !== "NO_TRADE").map((e) => e.elder);
  const regimeChanged = Boolean(ctx?.regimeNow && ctx.regimeNow !== trade.regime);
  let confidenceCalibrated: TradeReview["confidenceCalibrated"] = "insufficient_sample";
  if (sampleSize >= 30) {
    if (trade.calibrated >= 0.7 && !directionCorrect) confidenceCalibrated = "over";
    else if (trade.calibrated <= 0.45 && directionCorrect) confidenceCalibrated = "under";
    else confidenceCalibrated = "ok";
  }
  const thesisCorrect: boolean | "unknown" =
    trade.exitReason === "thesis_invalidated" ? false : directionCorrect;
  return {
    tradeId: trade.id,
    symbol: trade.symbol,
    at: nowIso(),
    thesisCorrect,
    directionCorrect,
    confidenceCalibrated,
    eldersRight,
    eldersWrong,
    regimeChanged,
    catalystNote: trade.exitReason === "thesis_invalidated" ? "Catalyst/thesis did not hold to target." : "Recorded for next calibration.",
    microstructureNote: "Monitor used mark vs stop/target; CVD not re-simulated on exit.",
    tpslReasonable: Math.abs(trade.rMultiple) < 8,
    executionNote: trade.closeSubmitted ? `Bitget close ${trade.closeOrderId ?? "no id"}` : "Exit was not submitted to Bitget.",
    nextTime:
      !directionCorrect && trade.calibrated > 0.65
        ? "High confidence was wrong — raise conflict penalties for this regime."
        : "Keep showing sample size; do not treat this as an edge.",
    rMultiple: trade.rMultiple,
    sampleSize,
  };
}
