import { describe, expect, it } from "vitest";
import { evaluatePosition } from "./engine";
import type { OpenPosition } from "../types";

const pos = (over: Partial<OpenPosition> = {}): OpenPosition => ({
  id: "pos_1",
  runId: "run_1",
  symbol: "NVDAUSDT",
  direction: "LONG",
  qty: 1,
  entry: 100,
  stop: 95,
  takeProfit: 110,
  invalidation: "close below 96",
  invalidationPrice: 96,
  leverage: 5,
  mode: "paper",
  clientOid: "x",
  openedAt: new Date().toISOString(),
  thesis: "test",
  regime: "trending",
  session: "LONDON",
  calibrated: 0.7,
  elders: [],
  status: "open",
  ...over,
});

const base = {
  spreadBps: 2,
  staleMs: 100,
  apiFailures: 0,
  realizedLossUsd: 0,
  failedOrders: 0,
  atrPct: 0.01,
};

describe("monitor", () => {
  it("holds when thesis intact", () => {
    const d = evaluatePosition({
      position: pos(),
      mark: 101,
      candles1h: [{ ts: 1, open: 100, high: 102, low: 99, close: 101, volume: 1, turnover: 1 }],
      ...base,
    });
    expect(d.action).toBe("HOLD");
    expect(d.thesisValid).toBe(true);
  });

  it("closes on 1H close below invalidation", () => {
    const d = evaluatePosition({
      position: pos(),
      mark: 97,
      candles1h: [{ ts: 1, open: 100, high: 100, low: 94, close: 95, volume: 1, turnover: 1 }],
      ...base,
    });
    expect(d.action).toBe("CLOSE");
    expect(d.thesisValid).toBe(false);
  });

  it("closes on stop", () => {
    const d = evaluatePosition({
      position: pos(),
      mark: 94,
      candles1h: [{ ts: 1, open: 100, high: 100, low: 94, close: 97, volume: 1, turnover: 1 }],
      ...base,
    });
    expect(d.action).toBe("CLOSE");
    expect(d.slHit).toBe(true);
  });

  it("kill-flattens on stale data independently of LLM", () => {
    const d = evaluatePosition({
      position: pos(),
      mark: 101,
      candles1h: [{ ts: 1, open: 100, high: 102, low: 99, close: 101, volume: 1, turnover: 1 }],
      ...base,
      staleMs: 60_000,
    });
    expect(d.action).toBe("KILL_FLATTEN");
  });
});
