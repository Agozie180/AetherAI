import { NextResponse } from "next/server";
import { listRuns } from "@/lib/memory/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const runs = listRuns(30).map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    symbol: r.symbol,
    mode: r.mode,
    decision: r.decision,
    calibrated: r.calibrated,
  }));
  return NextResponse.json({ ok: true, runs });
}
