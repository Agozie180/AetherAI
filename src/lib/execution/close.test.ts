import { describe, expect, it } from "vitest";
import { closePosition } from "./close";
import type { OpenPosition } from "../types";
import type { BitgetConfig } from "../bitget/client";

// No credentials → bitgetMode() === "public"; closePosition returns before any
// network call, so these tests are fully offline.
const publicCfg: BitgetConfig = { paper: true };

function mkPosition(over: Partial<OpenPosition> = {}): OpenPosition {
  return {
    id: "pos_1",
    runId: "run_1",
    symbol: "AAPLUSDT",
    direction: "LONG",
    qty: 10,
    entry: 100,
    stop: 95,
    takeProfit: 110,
    invalidation: "below 95",
    invalidationPrice: 95,
    leverage: 3,
    mode: "paper",
    clientOid: "ae1",
    openedAt: new Date().toISOString(),
    thesis: "t",
    regime: "trending",
    session: "LONDON",
    calibrated: 0.6,
    elders: [],
    status: "open",
    ...over,
  };
}

describe("closePosition", () => {
  it("refuses to close without credentials and simulates no close", async () => {
    const r = await closePosition({ position: mkPosition(), mark: 105, cfg: publicCfg, reason: "manual" });
    expect(r.ok).toBe(false);
    expect(r.submitted).toBe(false);
    expect(r.orderId).toBeUndefined();
    expect(r.error).toMatch(/credentials required/i);
    expect(r.exit).toBe(105);
  });

  it("derives a stable clientOid from position id + reason (idempotent close)", async () => {
    const a = await closePosition({ position: mkPosition(), mark: 105, cfg: publicCfg, reason: "stop" });
    const b = await closePosition({ position: mkPosition(), mark: 105, cfg: publicCfg, reason: "stop" });
    const c = await closePosition({ position: mkPosition(), mark: 105, cfg: publicCfg, reason: "take_profit" });
    expect(a.clientOid).toBe(b.clientOid);
    expect(a.clientOid).not.toBe(c.clientOid);
  });
});
