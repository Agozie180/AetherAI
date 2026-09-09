import { loadDotEnv } from "../lib/env";
loadDotEnv();

import { runAether } from "../lib/orchestrator/run";

async function main() {
  const symbol = process.argv[2] || "NVDAUSDT";
  const execute = process.argv.includes("--execute");
  const out = await runAether({ symbol, execute, mode: (process.env.AETHER_MODE as "paper" | "live" | "paused") || "paper" });
  const slim = {
    id: out.id,
    symbol: (out as { resolved?: { futures?: { symbol?: string } } }).resolved?.futures?.symbol ?? symbol,
    decision: (out as { decision?: string }).decision,
    noTradeReason: (out as { noTradeReason?: string }).noTradeReason,
    session: (out as { session?: unknown }).session,
    catalyst: (out as { research?: { catalyst?: unknown } }).research?.catalyst,
    why: (out as { research?: { why?: unknown } }).research?.why,
    council: (out as { council?: unknown }).council,
    confidence: (out as { confidence?: { raw?: number; calibrated?: number; adjustments?: unknown } }).confidence,
    gates: (out as { gates?: { name: string; passed: boolean; reason: string }[] }).gates?.map((g) => ({
      name: g.name,
      passed: g.passed,
      reason: g.reason,
    })),
    execution: (out as { execution?: unknown }).execution,
  };
  console.log(JSON.stringify(slim, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
