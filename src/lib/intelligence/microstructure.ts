import type { OrderBookLevel, PublicFill } from "../types";
import { mean } from "../util";

export interface MicrostructureSnapshot {
  spread: number;
  spreadBps: number;
  mid: number;
  bidDepth: number;
  askDepth: number;
  imbalance: number;
  pressure: "bid" | "ask" | "neutral";
  tradeImbalance: number;
  aggressiveBuyShare: number;
  /**
   * Signed volume delta (buy size − sell size) over the SAMPLED public-fills
   * window only. It is a short-term order-flow measure, NOT a persisted,
   * session-cumulative CVD: Bitget's public fills endpoint returns a bounded
   * recent window and we do not stitch a continuous series across ticks. Named
   * `cvd` for familiarity; see `cvdNote` and `capability.cvd` for the scope.
   */
  cvd: number;
  cvdNote: string;
  largeTrades: { side: "buy" | "sell"; price: number; size: number; ts: number }[];
  whaleNote: string;
  liquidityNote: string;
  capability: {
    orderBook: "AVAILABLE";
    publicFills: "AVAILABLE";
    /** Window-scoped delta from sampled fills — not a true cumulative CVD feed. */
    cvd: "WINDOW_ONLY";
    whaleFeed: "UNAVAILABLE";
    liquidationTape: "UNAVAILABLE";
    openInterest: "AVAILABLE";
    funding: "AVAILABLE";
  };
}

export function microstructureSnapshot(args: {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  fills: PublicFill[];
  last: number;
}): MicrostructureSnapshot {
  const bestBid = args.bids[0]?.price ?? 0;
  const bestAsk = args.asks[0]?.price ?? 0;
  const mid = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : args.last;
  const spread = bestAsk && bestBid ? bestAsk - bestBid : 0;
  const spreadBps = mid ? (spread / mid) * 10_000 : 0;
  const bidDepth = args.bids.slice(0, 10).reduce((s, l) => s + l.size * l.price, 0);
  const askDepth = args.asks.slice(0, 10).reduce((s, l) => s + l.size * l.price, 0);
  const denom = bidDepth + askDepth;
  const imbalance = denom ? bidDepth / denom : 0.5;

  let buySz = 0;
  let sellSz = 0;
  let cvd = 0;
  const sizes = args.fills.map((f) => f.size);
  const med = median(sizes);
  const largeTrades: MicrostructureSnapshot["largeTrades"] = [];
  for (const f of args.fills) {
    if (f.side === "buy") {
      buySz += f.size;
      cvd += f.size;
    } else {
      sellSz += f.size;
      cvd -= f.size;
    }
    if (med && f.size >= med * 4) {
      largeTrades.push({ side: f.side, price: f.price, size: f.size, ts: f.ts });
    }
  }
  const tot = buySz + sellSz;
  const tradeImbalance = tot ? (buySz - sellSz) / tot : 0;
  const aggressiveBuyShare = tot ? buySz / tot : 0.5;

  const pressure =
    imbalance > 0.58 && tradeImbalance > 0.05 ? "bid" : imbalance < 0.42 && tradeImbalance < -0.05 ? "ask" : "neutral";

  return {
    spread,
    spreadBps,
    mid,
    bidDepth,
    askDepth,
    imbalance,
    pressure,
    tradeImbalance,
    aggressiveBuyShare,
    cvd,
    cvdNote: `Signed volume delta over ${args.fills.length} sampled fills (window only — not a session-cumulative CVD series).`,
    largeTrades: largeTrades.slice(0, 8),
    whaleNote:
      largeTrades.length === 0
        ? "No Bitget whale API. Large prints inferred from public fills vs median size only."
        : `${largeTrades.length} prints ≥4× median fill size. Not a whale-label feed.`,
    liquidityNote: `Top-10 book depth bid $${bidDepth.toFixed(0)} / ask $${askDepth.toFixed(0)}. Spread ${spreadBps.toFixed(2)} bps.`,
    capability: {
      orderBook: "AVAILABLE",
      publicFills: "AVAILABLE",
      cvd: "WINDOW_ONLY",
      whaleFeed: "UNAVAILABLE",
      liquidationTape: "UNAVAILABLE",
      openInterest: "AVAILABLE",
      funding: "AVAILABLE",
    },
  };
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? mean(s);
}

export function conflictBlurb(args: {
  cvd: number;
  imbalance: number;
  fundingRate: number;
  largeSellShare: number;
}): string {
  const bits: string[] = [];
  if (args.cvd > 0) bits.push("window CVD net buy");
  else if (args.cvd < 0) bits.push("window CVD net sell");
  if (args.imbalance > 0.55) bits.push("book bid-heavy");
  else if (args.imbalance < 0.45) bits.push("book ask-heavy");
  if (args.fundingRate > 0.0003) bits.push("funding positive (longs pay)");
  else if (args.fundingRate < -0.0003) bits.push("funding negative (shorts pay)");
  if (args.largeSellShare > 0.6) bits.push("large prints skewed sell");
  const bull = args.cvd > 0 && args.imbalance > 0.55;
  const conflict = bull && (args.fundingRate > 0.0004 || args.largeSellShare > 0.6);
  if (conflict) {
    return `Bullish directional evidence with significant positioning conflict (${bits.join("; ")}).`;
  }
  return bits.join("; ") || "No strong microstructure skew.";
}
