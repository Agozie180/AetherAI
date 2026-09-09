import { loadDotEnv } from "../lib/env";
loadDotEnv();

import { loadInstruments, realitySpot, stockPerps } from "../lib/bitget/instruments";

async function main() {
  const { futures, spot, fetchedAt } = await loadInstruments(true);
  const stocks = stockPerps(futures);
  const rtokens = realitySpot(spot);
  const sample = stocks.slice(0, 25).map((s) => ({
    symbol: s.symbol,
    maxLeverage: s.maxLeverage,
    minLeverage: s.minLeverage,
    fundInterval: s.fundInterval,
    rToken: rtokens.find((r) => r.baseCoin.replace(/^R/i, "") === s.baseCoin || r.symbol === `R${s.baseCoin}USDT`)?.symbol,
  }));
  console.log(JSON.stringify({
    fetchedAt: new Date(fetchedAt).toISOString(),
    usdtFutures: futures.length,
    stockPerps: stocks.length,
    realitySpot: rtokens.length,
    note: "rToken is SPOT. Stock perps are unprefixed USDT-M futures. Do not invent RAAPLUSDT perps.",
    sample,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
