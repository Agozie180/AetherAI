import OpenAI from "openai";
import { listRuns, loadRun } from "../memory/store";

export async function answerQuestion(question: string, runId?: string): Promise<string> {
  const run = runId ? loadRun(runId) : listRuns(1)[0];
  if (!run) return "No stored run yet. Run an analysis first. I will not invent a desk state.";
  const state = JSON.parse(run.payload) as Record<string, unknown>;
  const key = process.env.XAI_API_KEY;
  if (!key) {
    return groundedFallback(question, state);
  }
  const client = new OpenAI({ apiKey: key, baseURL: "https://api.x.ai/v1" });
  const resp = await client.chat.completions.create({
    model: process.env.XAI_MODEL || "grok-4.6",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are AetherAI's trading desk. Answer only from the stored JSON. If a fact is missing, say so. Never invent order IDs, news, or Bitget products.",
      },
      {
        role: "user",
        content: `Question: ${question}\n\nStored run:\n${JSON.stringify(state).slice(0, 20000)}`,
      },
    ],
  });
  return resp.choices[0]?.message?.content ?? groundedFallback(question, state);
}

function groundedFallback(question: string, state: Record<string, unknown>): string {
  const q = question.toLowerCase();
  const council = state.council as { summary?: string; dissent?: { elder: string; vote: string }[] } | undefined;
  const decision = String(state.decision ?? "");
  const noTrade = String(state.noTradeReason ?? "");
  const research = state.research as { why?: { headline?: string; unanswered?: string[] }; catalyst?: { classification?: string } };
  const confidence = state.confidence as { raw?: number; calibrated?: number; adjustments?: { name: string; delta: number; reason: string }[] };
  const elders = (state.elders as { role: string; vote: string }[]) ?? [];
  const risk = state.risk as { invalidation?: string; stopWhy?: string; tpWhy?: string };

  if (q.includes("why") && q.includes("trade") && !q.includes("bull")) {
    return noTrade || `${decision}. ${council?.summary ?? ""}`;
  }
  if (q.includes("bull") || q.includes("bear") || q.includes("why are you")) {
    return research?.why?.headline ?? "No thesis stored.";
  }
  if (q.includes("disagree") || q.includes("elder")) {
    const lines = elders.map((e) => `${e.role}: ${e.vote}`).join("\n");
    const dissent = council?.dissent?.map((d) => `${d.elder}=${d.vote}`).join(", ") ?? "none";
    return `${lines}\nDissent: ${dissent}\n${council?.summary ?? ""}`;
  }
  if (q.includes("invalid")) return risk?.invalidation ?? "No invalidation stored.";
  if (q.includes("stop") || q.includes("target")) return `Stop: ${risk?.stopWhy ?? "n/a"}\nTarget: ${risk?.tpWhy ?? "n/a"}`;
  if (q.includes("confidence")) {
    const adj = (confidence?.adjustments ?? []).map((a) => `${a.name} ${a.delta}: ${a.reason}`).join("\n");
    return `Raw ${(confidence?.raw ?? 0) * 100}% → calibrated ${(confidence?.calibrated ?? 0) * 100}%\n${adj}`;
  }
  if (q.includes("catalyst") || q.includes("news")) {
    return `Catalyst: ${research?.catalyst?.classification}\n${research?.why?.headline}\nUnanswered: ${(research?.why?.unanswered ?? []).join("; ")}`;
  }
  return `${decision}\n${research?.why?.headline ?? ""}\n${council?.summary ?? ""}\n${noTrade}`;
}
