import { NextRequest, NextResponse } from "next/server";
import { runAether } from "@/lib/orchestrator/run";
import type { Mode } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { symbol?: string; execute?: boolean; mode?: Mode };
    const out = await runAether({
      symbol: body.symbol,
      execute: Boolean(body.execute),
      mode: body.mode,
    });
    return NextResponse.json({ ok: true, run: out });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
