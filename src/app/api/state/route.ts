import { NextResponse } from "next/server";
import { listReviews, listSettled, loadKill, loadPositions } from "@/lib/memory/store";
import { similarSetups } from "@/lib/memory/similar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settled = listSettled();
  const open = loadPositions();
  const probe = open[0];
  const similar = probe
    ? similarSetups({ regime: probe.regime, session: probe.session, direction: probe.direction }, settled)
    : similarSetups({ regime: "trending", session: "LONDON", direction: "LONG" }, settled);
  return NextResponse.json({
    ok: true,
    kill: loadKill(),
    open,
    settled: settled.slice(-20).reverse(),
    reviews: listReviews(10),
    similar,
  });
}
