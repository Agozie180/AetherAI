import { NextRequest, NextResponse } from "next/server";
import { answerQuestion } from "@/lib/desk/ask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { question?: string; runId?: string };
  if (!body.question) return NextResponse.json({ ok: false, error: "question required" }, { status: 400 });
  try {
    const answer = await answerQuestion(body.question, body.runId);
    return NextResponse.json({ ok: true, answer });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
