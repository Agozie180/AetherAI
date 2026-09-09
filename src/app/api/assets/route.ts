import { NextResponse } from "next/server";
import { loadInstruments, stockPerps, realitySpot } from "@/lib/bitget/instruments";
import { listSecCompanies } from "@/lib/research/sec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [{ futures, spot, fetchedAt }, sec] = await Promise.all([loadInstruments(), listSecCompanies()]);
    const tradable = new Set(stockPerps(futures).map((x) => x.baseCoin.toUpperCase()));
    return NextResponse.json({ ok: true, fetchedAt, bitgetStockPerps: stockPerps(futures), realitySpot: realitySpot(spot), usStocks: sec.map((x) => ({ ...x, tradableOnBitget: tradable.has(x.ticker), execution: tradable.has(x.ticker) ? "available" : "research_only" })) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
