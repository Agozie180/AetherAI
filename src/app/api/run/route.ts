import { NextRequest, NextResponse } from "next/server";
import { runAether } from "@/lib/orchestrator/run";
import type { Mode } from "@/lib/types";
import { isAdmin, requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { symbol?: string; execute?: boolean; mode?: Mode };
    if (body.execute) {
      const denied = requireAdmin(req);
      if (denied) return denied;
    }
    const out = await runAether({
      symbol: body.symbol,
      execute: Boolean(body.execute),
      mode: body.mode,
    });
    // Account equity is operator-only. Anonymous callers (the public demo)
    // still get the full analysis, but the balance is redacted to its
    // non-sensitive shape so the unauthenticated payload never leaks funds.
    // (Early-exit runs have no `account` field at all.)
    let run: unknown = out;
    if (!isAdmin(req) && "account" in out) {
      run = { ...out, account: { source: out.account.source, hasCredentials: out.account.hasCredentials } };
    }
    return NextResponse.json({ ok: true, run });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
