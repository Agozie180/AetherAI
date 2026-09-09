import { randomUUID } from "node:crypto";
import type { BitgetConfig } from "../bitget/client";
import { bitgetMode, bitgetPost } from "../bitget/client";
import type { OpenPosition } from "../types";
import { nowIso } from "../util";

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
  const clientOid = `ax${randomUUID().replace(/-/g, "").slice(0, 16)}`;
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
    return {
      ok: true,
      simulated: false,
      orderId: data.orderId,
      clientOid: data.clientOid || clientOid,
      exit: args.mark,
      at: nowIso(),
    };
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
