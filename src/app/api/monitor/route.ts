import { NextRequest, NextResponse } from "next/server";
import { flattenAll, tickMonitor } from "@/lib/monitor/tick";
import { loadKill, resetKill } from "@/lib/memory/store";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const out = await tickMonitor();
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action === "reset") return NextResponse.json({ ok: true, kill: resetKill() });
  if (body.action === "flatten") {
    const out = await flattenAll("desk flatten");
    return NextResponse.json({ ok: true, ticks: out.ticks, open: out.open, kill: out.kill });
  }
  const out = await tickMonitor();
  return NextResponse.json({ ok: true, ...out });
}
