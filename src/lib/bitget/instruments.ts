import type { Instrument, SymbolType } from "../types";
import { num } from "../util";
import { bitgetGet } from "./client";
import { lookupSecCompany } from "../research/sec";
import type { ResearchAsset } from "../types";

interface RawInstrument {
  symbol: string;
  category?: string;
  baseCoin?: string;
  quoteCoin?: string;
  symbolType?: string;
  isRwa?: string;
  isReality?: string;
  status?: string;
  type?: string;
  minLeverage?: string;
  maxLeverage?: string;
  minOrderQty?: string;
  minOrderAmount?: string;
  pricePrecision?: string;
  quantityPrecision?: string;
  quantityMultiplier?: string;
  makerFeeRate?: string;
  takerFeeRate?: string;
  fundInterval?: string;
  buyLimitPriceRatio?: string;
  sellLimitPriceRatio?: string;
}

let cache: { at: number; futures: Instrument[]; spot: Instrument[] } | null = null;
const TTL_MS = 5 * 60_000;

function mapSymbolType(v: string | undefined): SymbolType {
  if (v === "stock" || v === "crypto" || v === "metal" || v === "commodity") return v;
  return "unknown";
}

function mapRaw(raw: RawInstrument, fallbackCategory: string): Instrument {
  return {
    symbol: raw.symbol,
    category: raw.category || fallbackCategory,
    baseCoin: raw.baseCoin ?? "",
    quoteCoin: raw.quoteCoin ?? "",
    symbolType: mapSymbolType(raw.symbolType),
    isRwa: String(raw.isRwa ?? "").toUpperCase() === "YES",
    isReality: String(raw.isReality ?? "").toLowerCase() === "yes",
    status: raw.status ?? "",
    type: raw.type ?? "",
    minLeverage: num(raw.minLeverage, 1),
    maxLeverage: num(raw.maxLeverage, 1),
    minOrderQty: num(raw.minOrderQty),
    minOrderAmount: num(raw.minOrderAmount),
    pricePrecision: num(raw.pricePrecision, 2),
    quantityPrecision: num(raw.quantityPrecision, 4),
    quantityMultiplier: num(raw.quantityMultiplier, 0.01),
    makerFeeRate: num(raw.makerFeeRate),
    takerFeeRate: num(raw.takerFeeRate),
    fundInterval: num(raw.fundInterval, 8),
    buyLimitPriceRatio: num(raw.buyLimitPriceRatio),
    sellLimitPriceRatio: num(raw.sellLimitPriceRatio),
  };
}

export async function loadInstruments(force = false): Promise<{
  futures: Instrument[];
  spot: Instrument[];
  fetchedAt: number;
}> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    return { ...cache, fetchedAt: cache.at };
  }
  const [futRaw, spotRaw] = await Promise.all([
    bitgetGet<RawInstrument[]>("/api/v3/market/instruments", { category: "USDT-FUTURES" }),
    bitgetGet<RawInstrument[]>("/api/v3/market/instruments", { category: "SPOT" }),
  ]);
  const futures = (futRaw ?? []).map((r) => mapRaw(r, "USDT-FUTURES"));
  const spot = (spotRaw ?? []).map((r) => mapRaw(r, "SPOT"));
  cache = { at: Date.now(), futures, spot };
  return { futures, spot, fetchedAt: cache.at };
}

export function stockPerps(all: Instrument[]): Instrument[] {
  return all.filter(
    (i) =>
      i.category === "USDT-FUTURES" &&
      i.symbolType === "stock" &&
      i.status === "online" &&
      i.type === "perpetual",
  );
}

export function realitySpot(all: Instrument[]): Instrument[] {
  return all.filter((i) => i.category === "SPOT" && i.isReality && i.status === "online");
}

export function findFutures(all: Instrument[], symbol: string): Instrument | undefined {
  const u = symbol.toUpperCase();
  const exact = all.find((i) => i.category === "USDT-FUTURES" && i.symbol.toUpperCase() === u);
  if (exact) return exact;
  // Bare ticker (e.g. "NVDA" or "BTC") → resolve to the USDT-margined perpetual
  // symbol ("NVDAUSDT") instead of falling through to research-only.
  if (!/USDT$/i.test(u)) {
    return all.find((i) => i.category === "USDT-FUTURES" && i.symbol.toUpperCase() === `${u}USDT`);
  }
  return undefined;
}

export function findRealityPair(spot: Instrument[], base: string): Instrument | undefined {
  const want = `R${base.toUpperCase()}USDT`;
  return spot.find((i) => i.symbol.toUpperCase() === want);
}

export interface InstrumentResolution {
  requested: string;
  futures?: Instrument;
  realitySpot?: Instrument;
  tradableFutures: boolean;
  reason: string;
  capability: "AVAILABLE" | "UNAVAILABLE";
  researchAsset?: ResearchAsset;
}

export async function resolveInstrument(symbol: string): Promise<InstrumentResolution> {
  const { futures, spot } = await loadInstruments();
  const u = symbol.toUpperCase();
  const fut = findFutures(futures, u);
  const base = (fut?.baseCoin || u.replace(/USDT$/i, "").replace(/^R/i, "")).toUpperCase();
  const rspot = findRealityPair(spot, base);

  if (fut && fut.symbolType === "stock" && fut.status === "online") {
    return {
      requested: u,
      futures: fut,
      realitySpot: rspot,
      tradableFutures: true,
      reason: `${fut.symbol} is a live USDT-M stock perpetual (symbolType=stock).`,
      capability: "AVAILABLE",
    };
  }
  if (fut && fut.status === "online") {
    return {
      requested: u,
      futures: fut,
      realitySpot: rspot,
      tradableFutures: true,
      reason: `${fut.symbol} is a live ${fut.symbolType} perpetual, not a stock perp.`,
      capability: "AVAILABLE",
    };
  }
  if (rspot) {
    return {
      requested: u,
      futures: undefined,
      realitySpot: rspot,
      tradableFutures: false,
      reason: `${rspot.symbol} is Reality/rToken SPOT. There is no matching futures contract for this symbol. Do not fake a perp.`,
      capability: "UNAVAILABLE",
    };
  }
  const ticker = u.replace(/USDT$/i, "").replace(/^R/i, "");
  const company = await lookupSecCompany(ticker).catch(() => undefined);
  if (company) {
    return {
      requested: u,
      tradableFutures: false,
      reason: `${ticker} is a verified SEC-listed U.S. equity but has no live Bitget futures instrument. Research only; execution disabled.`,
      capability: "UNAVAILABLE",
      researchAsset: { ticker: company.ticker, name: company.name, cik: company.cik, tradableOnBitget: false, reason: "No matching Bitget USDT-FUTURES instrument." },
    };
  }
  return {
    requested: u,
    tradableFutures: false,
    reason: `${u} is not a live Bitget USDT-FUTURES instrument.`,
    capability: "UNAVAILABLE",
  };
}
