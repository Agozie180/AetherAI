import type { BitgetConfig } from "./client";
import { bitgetGet, bitgetMode, bitgetPost, bitgetConfigFromEnv } from "./client";
import { num } from "../util";

export interface AccountSnapshot {
  /** "bitget" = real balance read from the exchange (Demo or live).
   *  "none" = no credentials configured. "error" = credentials present but the
   *  balance fetch failed. Only "bitget" is ever allowed to size or execute. */
  source: "bitget" | "none" | "error";
  hasCredentials: boolean;
  equityUsd: number;
  usdtEquity: number;
  availableUsdt: number;
  unrealisedPnl: number;
  error?: string;
}

export interface ExchangePosition {
  symbol: string;
  posSide: "long" | "short" | "";
  total: number;
  available: number;
  avgPrice: number;
  leverage: number;
  unrealisedPnl: number;
  markPrice: number;
  liquidationPrice: number;
  marginMode: string;
}

export interface OrderSnapshot {
  orderId: string;
  clientOid: string;
  symbol: string;
  orderStatus: string;
  avgPrice: number;
  cumExecQty: number;
  qty: number;
  side: string;
  takeProfit?: string;
  stopLoss?: string;
  raw?: unknown;
}

export async function fetchAccount(cfg: BitgetConfig = bitgetConfigFromEnv()): Promise<AccountSnapshot> {
  if (bitgetMode(cfg) === "public") {
    // No credentials. We do NOT invent a balance — sizing and execution are
    // blocked upstream by the account gate. Analysis still runs on public data.
    return {
      source: "none",
      hasCredentials: false,
      equityUsd: 0,
      usdtEquity: 0,
      availableUsdt: 0,
      unrealisedPnl: 0,
      error: "No Bitget credentials. Add Demo (paper) or live keys to size and execute.",
    };
  }
  try {
    const data = await bitgetGet<{
      accountEquity?: string;
      usdtEquity?: string;
      unrealisedPnl?: string;
      usdtUnrealisedPnl?: string;
      assets?: Array<Record<string, string>>;
    }>("/api/v3/account/assets", {}, cfg);
    const usdt = (data.assets ?? []).find((a) => String(a.coin).toUpperCase() === "USDT");
    if (!Number.isFinite(num(data.accountEquity ?? data.usdtEquity)) || num(data.accountEquity ?? data.usdtEquity) <= 0) {
      throw new Error("Bitget account response has no positive equity");
    }
    // NOTE: the raw asset breakdown is deliberately NOT returned. It used to be
    // embedded in the run payload, which is reachable by unauthenticated
    // callers; that leaked the account balance. Only summary numbers survive.
    return {
      source: "bitget",
      hasCredentials: true,
      equityUsd: num(data.accountEquity ?? data.usdtEquity),
      usdtEquity: num(data.usdtEquity),
      availableUsdt: num(usdt?.available ?? usdt?.equity ?? data.usdtEquity),
      unrealisedPnl: num(data.usdtUnrealisedPnl ?? data.unrealisedPnl),
    };
  } catch (err) {
    // Credentials exist but the balance could not be read. We refuse to
    // substitute a fake balance — the account gate will block execution.
    return {
      source: "error",
      hasCredentials: true,
      equityUsd: 0,
      usdtEquity: 0,
      availableUsdt: 0,
      unrealisedPnl: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function fetchPositions(
  symbol?: string,
  cfg: BitgetConfig = bitgetConfigFromEnv(),
): Promise<ExchangePosition[]> {
  if (bitgetMode(cfg) === "public") return [];
  const data = await bitgetGet<{ list?: Array<Record<string, string>> }>(
    "/api/v3/position/current-position",
    { category: "USDT-FUTURES", symbol },
    cfg,
  );
  return (data.list ?? []).map((r) => ({
    symbol: r.symbol,
    posSide: r.posSide === "short" ? "short" : r.posSide === "long" ? "long" : "",
    total: num(r.total),
    available: num(r.available),
    avgPrice: num(r.avgPrice),
    leverage: num(r.leverage, 1),
    unrealisedPnl: num(r.unrealisedPnl),
    markPrice: num(r.markPrice),
    liquidationPrice: num(r.liquidationPrice),
    marginMode: r.marginMode ?? "",
  }));
}

export async function fetchOrderInfo(
  args: { orderId?: string; clientOid?: string },
  cfg: BitgetConfig = bitgetConfigFromEnv(),
): Promise<OrderSnapshot | undefined> {
  if (bitgetMode(cfg) === "public") return undefined;
  const data = await bitgetGet<Record<string, string>>("/api/v3/trade/order-info", {
    orderId: args.orderId,
    clientOid: args.clientOid,
  }, cfg);
  if (!data || (!data.orderId && !data.clientOid)) return undefined;
  return {
    orderId: data.orderId,
    clientOid: data.clientOid,
    symbol: data.symbol,
    orderStatus: data.orderStatus,
    avgPrice: num(data.avgPrice),
    cumExecQty: num(data.cumExecQty),
    qty: num(data.qty),
    side: data.side,
    takeProfit: data.takeProfit,
    stopLoss: data.stopLoss,
    raw: data,
  };
}

export async function setLeverage(args: {
  symbol: string;
  leverage: number;
  marginMode?: "isolated" | "crossed";
  posSide?: "long" | "short";
  cfg?: BitgetConfig;
}): Promise<{ ok: boolean; detail: string }> {
  const cfg = args.cfg ?? bitgetConfigFromEnv();
  if (!Number.isFinite(args.leverage) || args.leverage < 1) return { ok: false, detail: "invalid leverage" };
  const cap = Math.min(args.leverage, Number(process.env.AETHER_MAX_LEVERAGE || 5));
  if (cap < 1) return { ok: false, detail: "leverage < 1" };
  if (bitgetMode(cfg) === "public") {
    return { ok: true, detail: `Leverage ${cap}x not sent (no API keys). Policy would cap at ${cap}x.` };
  }
  try {
    await bitgetPost(
      "/api/v3/account/set-leverage",
      {
        category: "USDT-FUTURES",
        symbol: args.symbol,
        leverage: String(cap),
        posSide: args.posSide,
      },
      cfg,
    );
    return { ok: true, detail: `set-leverage ${cap}x on ${args.symbol}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
