import type { BitgetConfig } from "../bitget/client";
import { fetchOrderInfo, fetchPositions } from "../bitget/account";
import type { ExecutionReceipt } from "../types";
import { nowIso, sleep } from "../util";

export async function confirmFill(args: {
  receipt: ExecutionReceipt;
  mark: number;
  qty: number;
  cfg: BitgetConfig;
  expectedDirection?: "LONG" | "SHORT";
}): Promise<ExecutionReceipt> {
  const base = { ...args.receipt, confirmedAt: nowIso() };
  if (args.receipt.error) return base;
  // A preview (execute=false) is never a fill and must never be confirmed.
  if (args.receipt.preview || !args.receipt.submitted) {
    return { ...base, positionConfirmed: false };
  }
  if (!args.receipt.orderId) {
    // Submitted but the exchange returned no orderId — we cannot confirm and
    // will not fabricate a fill.
    return {
      ...base,
      positionConfirmed: false,
      error: base.error ?? "Order submitted but Bitget returned no orderId; fill cannot be confirmed.",
    };
  }
  for (let i = 0; i < 8; i++) {
    try {
      const info = await fetchOrderInfo({ orderId: args.receipt.orderId, clientOid: args.receipt.clientOid }, args.cfg);
      if (info && (info.orderStatus === "filled" || info.cumExecQty > 0)) {
        const positions = await fetchPositions(args.receipt.symbol, args.cfg).catch(() => []);
        const expectedSide = args.expectedDirection === "SHORT" ? "short" : args.expectedDirection === "LONG" ? "long" : undefined;
        const pos = positions.find((p) => p.symbol === args.receipt.symbol && p.total > 0 && (!expectedSide || p.posSide === expectedSide) && p.total + 1e-12 >= (info.cumExecQty || args.qty));
        if (!pos) {
          return { ...base, fillPrice: info.avgPrice || args.mark, fillQty: info.cumExecQty || args.qty, orderStatus: info.orderStatus, positionConfirmed: false, error: "Fill reported, but the expected exchange position was not confirmed.", raw: { order: info, positions } };
        }
        return {
          ...base,
          fillPrice: info.avgPrice || args.mark,
          fillQty: info.cumExecQty || args.qty,
          orderStatus: info.orderStatus,
          positionConfirmed: true,
          raw: { order: info, position: pos },
        };
      }
      if (info && (info.orderStatus === "cancelled")) {
        return { ...base, orderStatus: "cancelled", error: "Order cancelled before fill.", positionConfirmed: false };
      }
    } catch {
      /* retry */
    }
    await sleep(400);
  }
  return { ...base, error: "Fill not confirmed within timeout. Not claiming a live position.", positionConfirmed: false };
}
