import { policy } from "../policy";
import type { DataQuality, Instrument, ResearchItem, Ticker } from "../types";
import { nowIso, uid } from "../util";
import { classifyCatalyst, type CatalystReport } from "./catalyst";
import { fetchNewsResearch } from "./news";
import { scoreRelevance } from "./relevance";
import { fetchSecResearch } from "./sec";
import { whyIsItMoving, type WhyMoving } from "./whyMoving";

export interface ResearchBundle {
  ticker: string;
  name?: string;
  cik?: number;
  items: ResearchItem[];
  catalyst: CatalystReport;
  why: WhyMoving;
  quality: DataQuality;
  fetchedAt: string;
  notes: string[];
}

export async function runResearch(args: {
  instrument: Instrument;
  tickerTape: Ticker;
  btcChange?: number;
  volumeVsBaseline?: number;
}): Promise<ResearchBundle> {
  const fetchedAt = nowIso();
  const ticker = args.instrument.baseCoin.toUpperCase();
  const notes: string[] = [];
  const missing: string[] = [];
  const failures: string[] = [];
  const freshnessSeconds: Record<string, number> = {};
  const t0 = Date.now();

  const [sec, news] = await Promise.all([
    fetchSecResearch(ticker),
    fetchNewsResearch(`${ticker} ${args.instrument.symbol}`, ticker),
  ]);
  freshnessSeconds.sec = (Date.now() - t0) / 1000;
  freshnessSeconds.news = freshnessSeconds.sec;

  if (sec.error) {
    failures.push(`SEC: ${sec.error}`);
    if (!sec.company) missing.push("sec_company");
  }
  if (news.errors.length) failures.push(...news.errors.map((e) => `news: ${e}`));
  if (!news.items.length) missing.push("news_headlines");

  const priceItem: ResearchItem = {
    id: uid("px"),
    kind: "price",
    title: `${args.instrument.symbol} 24h ${((args.tickerTape.change24h || 0) * 100).toFixed(2)}%`,
    summary: `Bitget last ${args.tickerTape.last}, mark ${args.tickerTape.mark}, index ${args.tickerTape.index}, vol ${args.tickerTape.volume24h}, OI ${args.tickerTape.openInterest}, funding ${args.tickerTape.fundingRate}.`,
    source: "Bitget UTA v3 ticker",
    url: `https://www.bitget.com/futures/usdt/${args.instrument.symbol}`,
    publishedAt: new Date(args.tickerTape.ts || Date.now()).toISOString(),
    fetchedAt,
    freshnessMinutes: 0,
    relevance: 1,
    reliability: 0.95,
    relationToThesis: "Primary observable. Explains that it moved; does not by itself explain why.",
  };

  let items: ResearchItem[] = [...(sec.items ?? []), ...news.items, priceItem].map((it) =>
    scoreRelevance(it, ticker, sec.company?.name),
  );
  items = items.sort((a, b) => b.relevance * b.reliability - a.relevance * a.reliability);

  const catalyst = classifyCatalyst(items);
  const why = whyIsItMoving({
    ticker,
    name: sec.company?.name,
    tickerTape: args.tickerTape,
    btcChange: args.btcChange,
    catalyst,
    items,
    volumeVsBaseline: args.volumeVsBaseline,
  });

  notes.push(
    args.instrument.symbolType === "stock"
      ? "Underlying mapped from Bitget stock perpetual baseCoin to US ticker."
      : `Instrument symbolType=${args.instrument.symbolType}; SEC mapping may not apply.`,
  );
  if (args.instrument.symbolType === "stock" && !sec.company) {
    notes.push("Bitget lists a stock perp but SEC has no CIK for this ticker — treat issuer research as incomplete.");
  }

  const isFresh = (i: ResearchItem): boolean =>
    i.kind === "company" || i.freshnessMinutes <= policy.maxStaleResearchMin;

  const quality: DataQuality = {
    complete: missing.length === 0 && failures.filter((f) => f.startsWith("SEC")).length === 0,
    missing,
    stale: items.filter((i) => !isFresh(i) && i.kind !== "company").map((i) => i.id),
    failures,
    freshnessSeconds,
    freshSubstantive: items.filter((i) => i.kind !== "price" && isFresh(i)).length,
  };

  return {
    ticker,
    name: sec.company?.name,
    cik: sec.company?.cik,
    items,
    catalyst,
    why,
    quality,
    fetchedAt,
    notes,
  };
}
