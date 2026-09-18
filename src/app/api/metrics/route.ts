import { NextResponse } from "next/server";
import { listSettled } from "@/lib/memory/store";
import { computePerformance } from "@/lib/metrics/performance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, read-only performance endpoint. This is the paper-trading track
 * record — the quantitative half of the score — so it is meant to be inspected
 * by judges. It exposes only P&L / R / win-rate style aggregates computed from
 * settled trades; no account balance or credentials are involved.
 */
export async function GET() {
  const trades = listSettled(5000);
  const report = computePerformance(trades);
  return NextResponse.json({ ok: true, report });
}
