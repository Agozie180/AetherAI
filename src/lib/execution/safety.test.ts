import { describe, expect, it } from "vitest";
import { executionSafety, placeFuturesOrder } from "./safety";
import { policy } from "../policy";
import type { RiskPlan } from "../risk/engine";
import type { Instrument } from "../types";
import type { BitgetConfig } from "../bitget/client";

function mkPlan(over: Partial<RiskPlan> = {}): RiskPlan {
  return {
    allowed: true,
    reason: "ok",
    leverage: 3,
    qty: 10,
    notional: 1000,
    stop: 95,
    takeProfit: 110,
    extraTargets: [],
    rewardRisk: 2,
    invalidation: "below 95",
    stopWhy: "structure",
    tpWhy: "target",
    estimatedEv: 0.4,
    ...over,
  };
}

function mkInstrument(over: Partial<Instrument> = {}): Instrument {
  return {
    symbol: "AAPLUSDT",
    category: "USDT-FUTURES",
    baseCoin: "AAPL",
    quoteCoin: "USDT",
    symbolType: "stock",
    isRwa: true,
    isReality: true,
    status: "online",
    type: "perpetual",
    minLeverage: 1,
    maxLeverage: 5,
    minOrderQty: 0.1,
    minOrderAmount: 5,
    pricePrecision: 2,
    quantityPrecision: 1,
    quantityMultiplier: 1,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
    fundInterval: 8,
    buyLimitPriceRatio: 0.05,
    sellLimitPriceRatio: 0.05,
    ...over,
  };
}

// No apiKey/secret/passphrase → bitgetMode() === "public". Every execution path
// below returns BEFORE any network call, so these tests are fully offline.
const publicCfg: BitgetConfig = { paper: true };

const okArgs = () => ({
  instrument: mkInstrument(),
  tradableFutures: true,
  plan: mkPlan(),
  staleMs: 1000,
  maxStaleMs: 5000,
  killTripped: false,
  mode: "paper" as const,
});

function stepOk(check: ReturnType<typeof executionSafety>, name: string): boolean {
  return check.steps.find((s) => s.name === name)!.ok;
}

describe("executionSafety", () => {
  it("passes when every gate is green", () => {
    const check = executionSafety(okArgs());
    expect(check.passed).toBe(true);
    expect(check.steps.every((s) => s.ok)).toBe(true);
  });

  it("blocks leverage above the policy cap", () => {
    const check = executionSafety({ ...okArgs(), plan: mkPlan({ leverage: policy.maxLeverage + 1 }) });
    expect(check.passed).toBe(false);
    expect(stepOk(check, "leverage")).toBe(false);
  });

  it("blocks when the kill switch is tripped", () => {
    const check = executionSafety({ ...okArgs(), killTripped: true });
    expect(check.passed).toBe(false);
    expect(stepOk(check, "kill_switch")).toBe(false);
  });

  it("blocks in paused mode", () => {
    const check = executionSafety({ ...okArgs(), mode: "paused" });
    expect(check.passed).toBe(false);
    expect(stepOk(check, "mode")).toBe(false);
  });

  it("blocks when futures are not tradable", () => {
    const check = executionSafety({ ...okArgs(), tradableFutures: false });
    expect(check.passed).toBe(false);
    expect(stepOk(check, "futures_available")).toBe(false);
  });

  it("blocks a disallowed risk plan and surfaces its reason", () => {
    const check = executionSafety({ ...okArgs(), plan: mkPlan({ allowed: false, reason: "EV below threshold" }) });
    expect(check.passed).toBe(false);
    const step = check.steps.find((s) => s.name === "risk_plan")!;
    expect(step.ok).toBe(false);
    expect(step.detail).toBe("EV below threshold");
  });

  it("blocks stale data beyond the freshness budget", () => {
    const check = executionSafety({ ...okArgs(), staleMs: 9000, maxStaleMs: 5000 });
    expect(check.passed).toBe(false);
    expect(stepOk(check, "freshness")).toBe(false);
  });

  it("blocks a non-positive quantity and a missing instrument", () => {
    expect(stepOk(executionSafety({ ...okArgs(), plan: mkPlan({ qty: 0 }) }), "qty")).toBe(false);
    expect(stepOk(executionSafety({ ...okArgs(), instrument: undefined }), "instrument")).toBe(false);
  });
});

describe("placeFuturesOrder", () => {
  it("returns a preview (never a fill) when execute=false", async () => {
    const r = await placeFuturesOrder({
      cfg: publicCfg,
      instrument: mkInstrument(),
      vote: "LONG",
      plan: mkPlan(),
      execute: false,
      mode: "paper",
      runId: "run_1",
    });
    expect(r.preview).toBe(true);
    expect(r.submitted).toBe(false);
    expect(r.orderId).toBeUndefined();
    expect(r.side).toBe("buy");
    expect(r.note).toMatch(/preview/i);
  });

  it("refuses to execute without credentials and fabricates no fill", async () => {
    const r = await placeFuturesOrder({
      cfg: publicCfg,
      instrument: mkInstrument(),
      vote: "SHORT",
      plan: mkPlan(),
      execute: true,
      mode: "paper",
      runId: "run_2",
    });
    expect(r.submitted).toBe(false);
    expect(r.orderId).toBeUndefined();
    expect(r.error).toMatch(/credentials required/i);
    expect(r.side).toBe("sell");
  });

  it("derives a stable clientOid from the runId so a retry cannot double-fill", async () => {
    const base = { cfg: publicCfg, instrument: mkInstrument(), vote: "LONG" as const, plan: mkPlan(), execute: false, mode: "paper" as const, runId: "run_stable" };
    const a = await placeFuturesOrder(base);
    const b = await placeFuturesOrder(base);
    expect(a.clientOid).toBe(b.clientOid);
  });
});
