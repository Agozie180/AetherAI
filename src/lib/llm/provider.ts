import OpenAI from "openai";

export type LlmProvider = "openai" | "anthropic" | "none";

export interface LlmConfig {
  provider: LlmProvider;
  model: string;
}

export function llmConfig(): LlmConfig {
  const requested = String(process.env.LLM_PROVIDER || "none").toLowerCase();
  const provider: LlmProvider = requested === "anthropic" || requested === "openai" ? requested : "none";
  return { provider, model: process.env.LLM_MODEL || (provider === "anthropic" ? "claude-3-5-sonnet-latest" : "gpt-4o-mini") };
}

export function llmAvailable(): boolean {
  const c = llmConfig();
  return c.provider === "openai" ? Boolean(process.env.OPENAI_API_KEY) : c.provider === "anthropic" ? Boolean(process.env.ANTHROPIC_API_KEY) : false;
}

export async function completeJson(system: string, user: string): Promise<Record<string, unknown>> {
  const c = llmConfig();
  if (c.provider === "none" || !llmAvailable()) throw new Error("LLM provider is not configured");
  const text = c.provider === "openai" ? await openaiText(c, system, user) : await anthropicText(c, system, user);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("LLM response did not contain JSON");
  return JSON.parse(match[0]) as Record<string, unknown>;
}

async function openaiText(c: LlmConfig, system: string, user: string): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({ model: c.model, temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
  return response.choices[0]?.message?.content || "{}";
}

async function anthropicText(c: LlmConfig, system: string, user: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: c.model, max_tokens: 1200, temperature: 0.2, system, messages: [{ role: "user", content: user }] }),
  });
  if (!response.ok) throw new Error(`Anthropic HTTP ${response.status}`);
  const body = (await response.json()) as { content?: { text?: string }[] };
  return body.content?.map((x) => x.text || "").join("\n") || "{}";
}
