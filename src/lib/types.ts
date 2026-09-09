export type CapabilityClass =
  | "CONFIRMED"
  | "AVAILABLE"
  | "POSSIBLE"
  | "UNAVAILABLE"
  | "UNKNOWN";

export type Mode = "paper" | "live" | "paused";

export type Vote = "LONG" | "SHORT" | "NO_TRADE";

export type SessionId =
  | "ASIA"
  | "LONDON"
  | "NEW_YORK"
  | "OVERLAP_LONDON_NY"
  | "OVERLAP_ASIA_LONDON"
  | "OFF";

export type Regime =
  | "trending"
  | "ranging"
  | "breakout"
  | "transition"
  | "high_volatility"
  | "low_volatility"
  | "choppy"
  | "momentum_expansion"
  | "momentum_exhaustion";

export type Psychology =
  | "fear"
  | "neutral"
  | "greed"
  | "extreme_greed"
  | "panic"
  | "euphoria"
  | "capitulation"
  | "crowded";

export type CatalystClass = "known" | "possible" | "none";

export type ResearchKind =
  | "company"
  | "filing"
  | "earnings"
  | "news"
  | "macro"
  | "analyst"
  | "sector"
  | "price"
  | "geopolitical";

export type SymbolType = "stock" | "crypto" | "metal" | "commodity" | "unknown";

export interface Instrument {
  symbol: string;
  category: string;
  baseCoin: string;
  quoteCoin: string;
  symbolType: SymbolType;
  isRwa: boolean;
  isReality: boolean;
  status: string;
  type: string;
  minLeverage: number;
  maxLeverage: number;
  minOrderQty: number;
  minOrderAmount: number;
  pricePrecision: number;
  quantityPrecision: number;
  quantityMultiplier: number;
  makerFeeRate: number;
  takerFeeRate: number;
  fundInterval: number;
  buyLimitPriceRatio: number;
  sellLimitPriceRatio: number;
}

export interface ResearchItem {
  id: string;
  kind: ResearchKind;
  title: string;
  summary: string;
  source: string;
  url?: string;
  publishedAt: string;
  fetchedAt: string;
  freshnessMinutes: number;
  relevance: number;
  reliability: number;
  relationToThesis: string;
  raw?: Record<string, unknown>;
}

export interface DataQuality {
  complete: boolean;
  missing: string[];
  stale: string[];
  failures: string[];
  freshnessSeconds: Record<string, number>;
}

export interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface PublicFill {
  execId: string;
  price: number;
  size: number;
  side: "buy" | "sell";
  ts: number;
}

export interface Ticker {
  symbol: string;
  last: number;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  mark: number;
  index: number;
  change24h: number;
  volume24h: number;
  turnover24h: number;
  fundingRate: number;
  openInterest: number;
  ts: number;
}

export interface FundingInfo {
  symbol: string;
  fundingRate: number;
  intervalHours: number;
  nextUpdate?: number;
  minFundingRate?: number;
  maxFundingRate?: number;
  history: { ts: number; rate: number }[];
}

export interface GateResult {
  name: string;
  passed: boolean;
  critical: boolean;
  reason: string;
  detail?: Record<string, unknown>;
}

export interface ElderVote {
  elder: string;
  role: string;
  vote: Vote;
  direction: Vote;
  confidence: number;
  evidence: string[];
  objections: string[];
  risks: string[];
  recommendation: string;
  source: "llm" | "deterministic";
}

export interface ConfidenceTrace {
  raw: number;
  calibrated: number;
  components: { name: string; score: number; weight: number }[];
  adjustments: { name: string; delta: number; reason: string }[];
}

export interface ExecutionReceipt {
  mode: Mode | "simulated";
  simulated: boolean;
  symbol: string;
  side: "buy" | "sell";
  orderType: "market" | "limit";
  qty: string;
  orderId?: string;
  clientOid: string;
  takeProfit?: string;
  stopLoss?: string;
  raw?: unknown;
  error?: string;
  submittedAt: string;
}

export interface RunRequest {
  symbol?: string;
  mode?: Mode;
  execute?: boolean;
}
