import { NextRequest, NextResponse } from "next/server";
import { resolveInstrument } from "@/lib/bitget/instruments";
import { fetchTicker } from "@/lib/bitget/market";
import { runResearch } from "@/lib/research/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") || "NVDAUSDT").toUpperCase();
  try {
    const resolved = await resolveInstrument(symbol);
    if (!resolved.futures) {
      return NextResponse.json({ ok: false, resolved }, { status: 404 });
    }
    const tickerTape = await fetchTicker(resolved.futures.symbol);
    const research = await runResearch({ instrument: resolved.futures, tickerTape });
    return NextResponse.json({ ok: true, resolved, tickerTape, research });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
