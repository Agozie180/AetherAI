import { NextRequest, NextResponse } from "next/server";
import { answerQuestion } from "@/lib/desk/ask";
import { clientKey, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUESTION_CHARS = 1000;

export async function POST(req: NextRequest) {
  // /api/ask is intentionally public so judges can interrogate the desk, but it
  // is LLM-backed when a provider key is set — an anonymous caller could
  // otherwise burn the operator's budget. Rate-limit per client and cap length.
  const rl = rateLimit(`ask:${clientKey(req)}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate limit exceeded — try again shortly" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }
  const body = (await req.json().catch(() => ({}))) as { question?: string; runId?: string };
  if (!body.question) return NextResponse.json({ ok: false, error: "question required" }, { status: 400 });
  if (body.question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json({ ok: false, error: `question too long (max ${MAX_QUESTION_CHARS} chars)` }, { status: 400 });
  }
  try {
    const answer = await answerQuestion(body.question, body.runId);
    return NextResponse.json({ ok: true, answer });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
