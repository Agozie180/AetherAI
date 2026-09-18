import { describe, expect, it } from "vitest";
import { confirmFill } from "./confirm";
import type { ExecutionReceipt } from "../types";
import type { BitgetConfig } from "../bitget/client";

// All cases below return before confirmFill's polling loop, so no network runs.
const cfg: BitgetConfig = { paper: true };

function mkReceipt(over: Partial<ExecutionReceipt> = {}): ExecutionReceipt {
  return {
    mode: "paper",
    submitted: true,
    symbol: "AAPLUSDT",
    side: "buy",
    orderType: "market",
    qty: "10",
    clientOid: "aeabc123",
    submittedAt: new Date().toISOString(),
    ...over,
  };
}

describe("confirmFill", () => {
  it("never confirms a preview", async () => {
    const r = await confirmFill({ receipt: mkReceipt({ preview: true, submitted: false }), mark: 100, qty: 10, cfg });
    expect(r.positionConfirmed).toBe(false);
    expect(r.confirmedAt).toBeDefined();
  });

  it("never confirms an unsubmitted receipt", async () => {
    const r = await confirmFill({ receipt: mkReceipt({ submitted: false }), mark: 100, qty: 10, cfg });
    expect(r.positionConfirmed).toBe(false);
  });

  it("does not fabricate a fill when submitted without an orderId", async () => {
    const r = await confirmFill({ receipt: mkReceipt({ submitted: true, orderId: undefined }), mark: 100, qty: 10, cfg });
    expect(r.positionConfirmed).toBe(false);
    expect(r.error).toMatch(/no orderId/i);
  });

  it("passes an already-errored receipt through without ever confirming", async () => {
    const r = await confirmFill({ receipt: mkReceipt({ error: "leverage not confirmed", orderId: "o1" }), mark: 100, qty: 10, cfg });
    expect(r.error).toBe("leverage not confirmed");
    expect(r.positionConfirmed).not.toBe(true);
    expect(r.confirmedAt).toBeDefined();
  });
});
