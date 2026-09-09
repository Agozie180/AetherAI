import { NextResponse } from "next/server";
import { loadInstruments, realitySpot, stockPerps } from "@/lib/bitget/instruments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { futures, spot, fetchedAt } = await loadInstruments();
    const stocks = stockPerps(futures);
    return NextResponse.json({
      ok: true,
      fetchedAt,
      counts: {
        usdtFutures: futures.length,
        stockPerps: stocks.length,
        realitySpot: realitySpot(spot).length,
      },
      stockPerps: stocks.map((s) => ({
        symbol: s.symbol,
        baseCoin: s.baseCoin,
        maxLeverage: s.maxLeverage,
        minLeverage: s.minLeverage,
        fundInterval: s.fundInterval,
        status: s.status,
      })),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
