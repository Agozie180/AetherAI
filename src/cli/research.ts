import { loadDotEnv } from "../lib/env";
loadDotEnv();

import { resolveInstrument } from "../lib/bitget/instruments";
import { fetchTicker } from "../lib/bitget/market";
import { runResearch } from "../lib/research/engine";

async function main() {
  const symbol = (process.argv[2] || "NVDAUSDT").toUpperCase();
  const resolved = await resolveInstrument(symbol);
  console.log(JSON.stringify({ resolved: {
    requested: resolved.requested,
    tradableFutures: resolved.tradableFutures,
    reason: resolved.reason,
    futures: resolved.futures?.symbol,
    realitySpot: resolved.realitySpot?.symbol,
    capability: resolved.capability,
  } }, null, 2));
  if (!resolved.futures) {
    process.exitCode = 2;
    return;
  }
  const tickerTape = await fetchTicker(resolved.futures.symbol);
  const bundle = await runResearch({ instrument: resolved.futures, tickerTape });
  const slim = {
    ticker: bundle.ticker,
    name: bundle.name,
    cik: bundle.cik,
    catalyst: bundle.catalyst,
    why: bundle.why,
    quality: bundle.quality,
    notes: bundle.notes,
    items: bundle.items.slice(0, 12).map((i) => ({
      kind: i.kind,
      title: i.title,
      source: i.source,
      publishedAt: i.publishedAt,
      freshnessMinutes: Math.round(i.freshnessMinutes),
      relevance: Number(i.relevance.toFixed(2)),
      reliability: i.reliability,
      url: i.url,
    })),
  };
  console.log(JSON.stringify(slim, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
