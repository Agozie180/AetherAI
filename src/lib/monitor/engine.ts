import type { Candle, MonitorAction, OpenPosition } from "../types";
import { policy } from "../policy";

export interface MonitorDecision {
  action: MonitorAction;
  reason: string;
  thesisValid: boolean;
  tpHit: boolean;
  slHit: boolean;
  lastClose: number;
  mark: number;
  events: string[];
}

export function evaluatePosition(args: {
  position: OpenPosition;
  mark: number;
  candles1h: Candle[];
  spreadBps: number;
  staleMs: number;
  apiFailures: number;
  realizedLossUsd: number;
  failedOrders: number;
  atrPct: number;
  regime?: string;
  killAlready?: boolean;
}): MonitorDecision {
  const events: string[] = [];
  const p = args.position;
  const lastClose = args.candles1h.at(-1)?.close ?? args.mark;
  const tpHit = p.direction === "LONG" ? args.mark >= p.takeProfit : args.mark <= p.takeProfit;
  const slHit = p.direction === "LONG" ? args.mark <= p.stop : args.mark >= p.stop;
  const thesisValid =
    p.direction === "LONG" ? lastClose >= p.invalidationPrice : lastClose <= p.invalidationPrice;
  if (tpHit) events.push("mark reached take-profit");
  if (slHit) events.push("mark reached stop");
  if (!thesisValid) events.push(`1H close ${lastClose} vs invalidation ${p.invalidationPrice}`);
  if (args.regime && args.regime !== p.regime) events.push(`regime ${p.regime} → ${args.regime}`);

  if (args.killAlready) {
    return { action: "KILL_FLATTEN", reason: "Kill switch already tripped.", thesisValid, tpHit, slHit, lastClose, mark: args.mark, events };
  }
  if (args.apiFailures >= 3 || args.staleMs > policy.maxStaleMarketMs || args.spreadBps > policy.maxSpreadBps * 2) {
    return {
      action: "KILL_FLATTEN",
      reason: `Emergency: failures=${args.apiFailures} stale=${args.staleMs}ms spread=${args.spreadBps.toFixed(2)}bps`,
      thesisValid,
      tpHit,
      slHit,
      lastClose,
      mark: args.mark,
      events,
    };
  }
  if (args.realizedLossUsd <= -Math.abs(policy.killSwitchLossUsd)) {
    return { action: "KILL_FLATTEN", reason: "Account loss limit.", thesisValid, tpHit, slHit, lastClose, mark: args.mark, events };
  }
  if (args.failedOrders >= 3) {
    return { action: "KILL_FLATTEN", reason: "Repeated failed orders.", thesisValid, tpHit, slHit, lastClose, mark: args.mark, events };
  }
  if (args.atrPct > policy.atrShockFlattenPct) {
    return { action: "KILL_FLATTEN", reason: `Volatility shock ATR ${(args.atrPct * 100).toFixed(2)}% of price.`, thesisValid, tpHit, slHit, lastClose, mark: args.mark, events };
  }
  if (slHit) return { action: "CLOSE", reason: "Stop hit.", thesisValid, tpHit, slHit, lastClose, mark: args.mark, events };
  if (tpHit) return { action: "CLOSE", reason: "Take-profit hit.", thesisValid, tpHit, slHit, lastClose, mark: args.mark, events };
  if (!thesisValid) return { action: "CLOSE", reason: "Thesis invalidated on 1H close.", thesisValid, tpHit, slHit, lastClose, mark: args.mark, events };
  return { action: "HOLD", reason: "Thesis intact; TP/SL not hit.", thesisValid, tpHit, slHit, lastClose, mark: args.mark, events };
}

export function exitReasonOf(d: MonitorDecision): string {
  if (d.action === "KILL_FLATTEN") return "kill_switch";
  if (d.slHit) return "stop_loss";
  if (d.tpHit) return "take_profit";
  if (!d.thesisValid) return "thesis_invalidated";
  return "monitor_close";
}
