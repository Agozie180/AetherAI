import type { Candle, FundingInfo, OrderBookLevel, PublicFill, Ticker } from "../types";
import { num } from "../util";
import { bitgetGet } from "./client";

export const CANDLE_INTERVALS = ["1m", "3m", "5m", "15m", "30m", "1H", "4H", "6H", "12H", "1D"] as const;
export type CandleInterval = (typeof CANDLE_INTERVALS)[number];

export function normalizeInterval(raw: string): CandleInterval {
  const map: Record<string, CandleInterval> = {
    "1m": "1m",
    "3m": "3m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1H",
    "1H": "1H",
    "4h": "4H",
    "4H": "4H",
    "6h": "6H",
    "6H": "6H",
    "12h": "12H",
    "12H": "12H",
    "1d": "1D",
    "1D": "1D",
  };
  const v = map[raw];
  if (!v) throw new Error(`Unsupported Bitget candle interval: ${raw}. Use 1H/4H not 1h/4h.`);
  return v;
}

export async function fetchTicker(symbol: string, category = "USDT-FUTURES"): Promise<Ticker> {
  const data = await bitgetGet<Array<Record<string, string>>>("/api/v3/market/tickers", {
    category,
    symbol,
  });
  const row = Array.isArray(data) ? data[0] : undefined;
  if (!row) throw new Error(`No ticker for ${category} ${symbol}`);
  return {
    symbol: row.symbol,
    last: num(row.lastPrice),
    bid: num(row.bid1Price),
    ask: num(row.ask1Price),
    bidSize: num(row.bid1Size),
    askSize: num(row.ask1Size),
    mark: num(row.markPrice),
    index: num(row.indexPrice),
    change24h: num(row.price24hPcnt),
    volume24h: num(row.volume24h),
    turnover24h: num(row.turnover24h),
    fundingRate: num(row.fundingRate),
    openInterest: num(row.openInterest),
    ts: num(row.ts),
  };
}

export async function fetchOrderBook(
  symbol: string,
  limit = 50,
  category = "USDT-FUTURES",
): Promise<{ bids: OrderBookLevel[]; asks: OrderBookLevel[]; ts: number }> {
  const data = await bitgetGet<{ a: [number, number][]; b: [number, number][]; ts: string }>(
    "/api/v3/market/orderbook",
    { category, symbol, limit },
  );
  return {
    asks: (data.a ?? []).map(([price, size]) => ({ price: num(price), size: num(size) })),
    bids: (data.b ?? []).map(([price, size]) => ({ price: num(price), size: num(size) })),
    ts: num(data.ts),
  };
}

export async function fetchFills(
  symbol: string,
  category = "USDT-FUTURES",
): Promise<PublicFill[]> {
  const data = await bitgetGet<Array<Record<string, string>>>("/api/v3/market/fills", {
    category,
    symbol,
  });
  return (data ?? []).map((r) => ({
    execId: r.execId,
    price: num(r.price),
    size: num(r.size),
    side: String(r.side).toLowerCase() === "sell" ? "sell" : "buy",
    ts: num(r.ts),
  }));
}

export async function fetchCandles(
  symbol: string,
  interval: string,
  limit = 200,
  category = "USDT-FUTURES",
): Promise<Candle[]> {
  const iv = normalizeInterval(interval);
  const data = await bitgetGet<string[][]>("/api/v3/market/candles", {
    category,
    symbol,
    interval: iv,
    limit,
  });
  const rows = (data ?? []).map((r) => ({
    ts: num(r[0]),
    open: num(r[1]),
    high: num(r[2]),
    low: num(r[3]),
    close: num(r[4]),
    volume: num(r[5]),
    turnover: num(r[6]),
  }));
  return rows.sort((a, b) => a.ts - b.ts);
}

export async function fetchOpenInterest(symbol: string, category = "USDT-FUTURES"): Promise<number> {
  const data = await bitgetGet<{ list?: { symbol: string; openInterest: string }[] }>(
    "/api/v3/market/open-interest",
    { category, symbol },
  );
  return num(data?.list?.[0]?.openInterest);
}

export async function fetchFunding(symbol: string, category = "USDT-FUTURES"): Promise<FundingInfo> {
  const [cur, hist] = await Promise.all([
    bitgetGet<Array<Record<string, string>>>("/api/v3/market/current-fund-rate", {
      category,
      symbol,
    }),
    bitgetGet<{ resultList?: Array<Record<string, string>> }>(
      "/api/v3/market/history-fund-rate",
      { category, symbol },
    ).catch(() => ({ resultList: [] })),
  ]);
  const row = cur?.[0] ?? {};
  const history = (hist.resultList ?? []).map((h) => ({
    ts: num(h.fundingRateTimestamp),
    rate: num(h.fundingRate),
  }));
  return {
    symbol: row.symbol || symbol,
    fundingRate: num(row.fundingRate),
    intervalHours: num(row.fundingRateInterval, 8),
    nextUpdate: num(row.nextUpdate) || undefined,
    minFundingRate: num(row.minFundingRate),
    maxFundingRate: num(row.maxFundingRate),
    history,
  };
}

export async function fetchMarketBundle(symbol: string) {
  const fetchedAt = Date.now();
  const [ticker, book, fills, oi, funding, c5, c15, c1h, c4h, c1d] = await Promise.all([
    fetchTicker(symbol),
    fetchOrderBook(symbol, 50),
    fetchFills(symbol),
    fetchOpenInterest(symbol),
    fetchFunding(symbol),
    fetchCandles(symbol, "5m", 200),
    fetchCandles(symbol, "15m", 200),
    fetchCandles(symbol, "1H", 200),
    fetchCandles(symbol, "4H", 200),
    fetchCandles(symbol, "1D", 200),
  ]);
  return {
    fetchedAt,
    ticker,
    book,
    fills,
    openInterest: oi,
    funding,
    candles: { "5m": c5, "15m": c15, "1H": c1h, "4H": c4h, "1D": c1d },
  };
}
