import type { CatalystReport } from "./catalyst";
import type { ResearchItem } from "../types";
import type { Ticker } from "../types";

export interface WhyMoving {
  question: "Why is this asset moving?";
  headline: string;
  drivers: { claim: string; support: string; confidence: number }[];
  unanswered: string[];
}

export function whyIsItMoving(args: {
  ticker: string;
  name?: string;
  tickerTape: Ticker;
  btcChange?: number;
  catalyst: CatalystReport;
  items: ResearchItem[];
  volumeVsBaseline?: number;
}): WhyMoving {
  const { ticker, name, tickerTape, btcChange, catalyst, items, volumeVsBaseline } = args;
  const pct = tickerTape.change24h * 100;
  const dir = pct >= 0 ? "up" : "down";
  const drivers: WhyMoving["drivers"] = [];

  drivers.push({
    claim: `${ticker} last ${tickerTape.last} (${pct.toFixed(2)}% 24h, ${dir}) on Bitget mark ${tickerTape.mark}.`,
    support: `Bitget ticker ts=${tickerTape.ts} vol24h=${tickerTape.volume24h} turnover=${tickerTape.turnover24h}`,
    confidence: 0.95,
  });

  if (volumeVsBaseline !== undefined) {
    drivers.push({
      claim:
        volumeVsBaseline > 1.4
          ? `Volume is elevated (${volumeVsBaseline.toFixed(2)}× baseline). Move has participation.`
          : volumeVsBaseline < 0.7
            ? `Volume is light (${volumeVsBaseline.toFixed(2)}× baseline). Move may be thin.`
            : `Volume is near baseline (${volumeVsBaseline.toFixed(2)}×).`,
      support: "Bitget candles vs 20-period volume mean",
      confidence: 0.8,
    });
  }

  if (btcChange !== undefined) {
    const sameDir = Math.sign(btcChange) === Math.sign(tickerTape.change24h);
    drivers.push({
      claim: sameDir
        ? `Move is aligned with BTC (${(btcChange * 100).toFixed(2)}% 24h). May not be name-specific.`
        : `Move is independent of BTC (${(btcChange * 100).toFixed(2)}% 24h). Name-specific pressure more likely.`,
      support: "Bitget BTCUSDT ticker vs asset ticker",
      confidence: 0.7,
    });
  }

  if (catalyst.classification === "known" && catalyst.primary) {
    drivers.push({
      claim: `Known catalyst candidate: ${catalyst.primary.title}`,
      support: `${catalyst.primary.source} ${catalyst.primary.publishedAt} reliability=${catalyst.primary.reliability}`,
      confidence: catalyst.primary.reliability * catalyst.primary.relevance,
    });
  } else if (catalyst.classification === "possible" && catalyst.primary) {
    drivers.push({
      claim: `Possible catalyst, not confirmed causal: ${catalyst.primary.title}`,
      support: catalyst.rationale,
      confidence: 0.4,
    });
  } else {
    drivers.push({
      claim: "No identifiable fundamental catalyst in the research window.",
      support: catalyst.rationale,
      confidence: 0.6,
    });
  }

  const unanswered: string[] = [];
  if (!items.some((i) => i.kind === "earnings" && i.freshnessMinutes < 48 * 60)) {
    unanswered.push("No fresh earnings 8-K in the last 48h.");
  }
  if (!items.some((i) => i.kind === "news" && i.freshnessMinutes < 360)) {
    unanswered.push("No fresh news items in the last 6h.");
  }
  if (Math.abs(pct) > 3 && catalyst.classification === "none") {
    unanswered.push("Large move without a sourced catalyst — flow, after-hours gap, or missing source.");
  }

  const headline =
    catalyst.classification === "known"
      ? `${name ?? ticker} is ${dir} with a sourced catalyst candidate; still requires flow confirmation.`
      : catalyst.classification === "possible"
        ? `${name ?? ticker} is ${dir}; a possible catalyst exists but is not confirmed.`
        : `${name ?? ticker} is ${dir} without an identifiable catalyst in SEC/news.`;

  return { question: "Why is this asset moving?", headline, drivers, unanswered };
}
