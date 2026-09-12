import { createHash, randomUUID } from "node:crypto";
import type { BitgetConfig } from "../bitget/client";
import { bitgetMode, bitgetPost } from "../bitget/client";
import { fetchOrderInfo } from "../bitget/account";
import type { OpenPosition } from "../types";
import { nowIso, sleep } from "../util";

export interface CloseResult {
  ok: boolean;
  simulated: boolean;
  orderId?: string;
  clientOid: string;
  exit: number;
  error?: string;
  at: string;
}

export async function closePosition(args: {
  position: OpenPosition;
  mark: number;
  cfg: BitgetConfig;
  reason: string;
}): Promise<CloseResult> {
  const clientOid = args.position.id
    ? `ax${createHash("sha256").update(`${args.position.id}:${args.reason}`).digest("hex").slice(0, 16)}`
    : `ax${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const side = args.position.direction === "LONG" ? "sell" : "buy";
  const posSide = args.position.direction === "LONG" ? "long" : "short";

  if (args.position.simulated || bitgetMode(args.cfg) === "public") {
    return {
      ok: true,
      simulated: true,
      clientOid,
      exit: args.mark,
      at: nowIso(),
    };
  }

  try {
    const data = await bitgetPost<{ orderId?: string; clientOid?: string }>(
      "/api/v3/trade/place-order",
      {
        category: "USDT-FUTURES",
        symbol: args.position.symbol,
        qty: String(args.position.qty),
        side,
        orderType: "market",
        posSide,
        reduceOnly: "yes",
        clientOid,
      },
      args.cfg,
    );
    const receipt = {
      ok: true,
      simulated: false,
      orderId: data.orderId,
      clientOid: data.clientOid || clientOid,
      exit: args.mark,
      at: nowIso(),
    };
    if (!receipt.orderId) return { ...receipt, ok: false, error: "Bitget accepted close request without an orderId." };
    for (let i = 0; i < 8; i++) {
      const info = await fetchOrderInfo({ orderId: receipt.orderId, clientOid: receipt.clientOid }, args.cfg).catch(() => undefined);
      if (info && (info.orderStatus === "filled" || info.cumExecQty >= args.position.qty)) return receipt;
      if (info && ["cancelled", "rejected", "failed"].includes(info.orderStatus.toLowerCase())) {
        return { ...receipt, ok: false, error: `Bitget close order ${info.orderStatus}.` };
      }
      await sleep(400);
    }
    return { ...receipt, ok: false, error: "Close order was not confirmed filled within timeout." };
  } catch (err) {
    return {
      ok: false,
      simulated: false,
      clientOid,
      exit: args.mark,
      error: err instanceof Error ? err.message : String(err),
      at: nowIso(),
    };
  }
}
