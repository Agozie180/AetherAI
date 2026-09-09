import { randomUUID } from "node:crypto";
import type { ExecutionReceipt, Instrument, Mode, Vote } from "../types";
import { nowIso } from "../util";
import { bitgetMode, bitgetPost, type BitgetConfig } from "../bitget/client";
import { setLeverage } from "../bitget/account";
import type { RiskPlan } from "../risk/engine";

export interface SafetyCheck {
  passed: boolean;
  steps: { name: string; ok: boolean; detail: string }[];
}

export function executionSafety(args: {
  instrument?: Instrument;
  tradableFutures: boolean;
  plan: RiskPlan;
  staleMs: number;
  maxStaleMs: number;
  killTripped: boolean;
  mode: Mode;
}): SafetyCheck {
  const steps = [
    { name: "instrument", ok: !!args.instrument, detail: args.instrument?.symbol ?? "missing" },
    {
      name: "futures_available",
      ok: args.tradableFutures,
      detail: args.tradableFutures ? "stock/crypto perp online" : "no futures instrument",
    },
    { name: "leverage", ok: args.plan.leverage <= 5, detail: `leverage ${args.plan.leverage}` },
    { name: "qty", ok: args.plan.qty > 0, detail: String(args.plan.qty) },
    { name: "tpsl", ok: args.plan.stop > 0 && args.plan.takeProfit > 0, detail: `SL ${args.plan.stop} TP ${args.plan.takeProfit}` },
    { name: "freshness", ok: args.staleMs <= args.maxStaleMs, detail: `${args.staleMs}ms` },
    { name: "kill_switch", ok: !args.killTripped, detail: args.killTripped ? "TRIPPED" : "clear" },
    { name: "mode", ok: args.mode !== "paused", detail: args.mode },
    { name: "risk_plan", ok: args.plan.allowed, detail: args.plan.reason },
  ];
  return { passed: steps.every((s) => s.ok), steps };
}

export async function placeFuturesOrder(args: {
  cfg: BitgetConfig;
  instrument: Instrument;
  vote: Vote;
  plan: RiskPlan;
  execute: boolean;
  mode: Mode;
}): Promise<ExecutionReceipt> {
  const clientOid = `ae${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const side = args.vote === "SHORT" ? "sell" : "buy";
  const posSide = args.vote === "SHORT" ? "short" : "long";
  const body = {
    category: "USDT-FUTURES",
    symbol: args.instrument.symbol,
    qty: String(args.plan.qty),
    side,
    orderType: "market",
    posSide,
    clientOid,
    takeProfit: String(args.plan.takeProfit),
    stopLoss: String(args.plan.stop),
    tpTriggerBy: "mark",
    slTriggerBy: "mark",
    tpOrderType: "market",
    slOrderType: "market",
    marginMode: "isolated",
  };

  if (!args.execute) {
    return {
      mode: args.mode,
      simulated: true,
      symbol: args.instrument.symbol,
      side,
      orderType: "market",
      qty: body.qty,
      clientOid,
      takeProfit: body.takeProfit,
      stopLoss: body.stopLoss,
      submittedAt: nowIso(),
      error: "execute=false; not submitted.",
    };
  }

  const lev = await setLeverage({
    symbol: args.instrument.symbol,
    leverage: args.plan.leverage,
    marginMode: "isolated",
    posSide,
    cfg: args.cfg,
  });
  if (!lev.ok) {
    return {
      mode: args.mode,
      simulated: false,
      symbol: args.instrument.symbol,
      side,
      orderType: "market",
      qty: body.qty,
      clientOid,
      takeProfit: body.takeProfit,
      stopLoss: body.stopLoss,
      leverageSet: lev.detail,
      submittedAt: nowIso(),
      error: `Leverage was not confirmed: ${lev.detail}`,
    };
  }

  const mode = bitgetMode(args.cfg);
  if (mode === "public") {
    return {
      mode: "simulated",
      simulated: true,
      symbol: args.instrument.symbol,
      side,
      orderType: "market",
      qty: body.qty,
      clientOid,
      takeProfit: body.takeProfit,
      stopLoss: body.stopLoss,
      leverageSet: lev.detail,
      submittedAt: nowIso(),
      raw: { note: "No Bitget API keys. Local simulation only. NOT a live or demo fill.", leverage: lev },
    };
  }

  try {
    const data = await bitgetPost<{ orderId?: string; clientOid?: string }>(
      "/api/v3/trade/place-order",
      body,
      args.cfg,
    );
    return {
      mode: args.cfg.paper ? "paper" : "live",
      simulated: false,
      symbol: args.instrument.symbol,
      side,
      orderType: "market",
      qty: body.qty,
      orderId: data.orderId,
      clientOid: data.clientOid || clientOid,
      takeProfit: body.takeProfit,
      stopLoss: body.stopLoss,
      leverageSet: lev.detail,
      raw: data,
      submittedAt: nowIso(),
    };
  } catch (err) {
    return {
      mode: args.cfg.paper ? "paper" : "live",
      simulated: false,
      symbol: args.instrument.symbol,
      side,
      orderType: "market",
      qty: body.qty,
      clientOid,
      takeProfit: body.takeProfit,
      stopLoss: body.stopLoss,
      submittedAt: nowIso(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
