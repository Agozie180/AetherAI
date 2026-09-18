import { loadDotEnv } from "../lib/env";
loadDotEnv();

import { runAether } from "../lib/orchestrator/run";
import { tickMonitor } from "../lib/monitor/tick";
import { appendPaperLog, getOpenBySymbol, loadKill, loadPositions } from "../lib/memory/store";
import { nowIso, sleep } from "../lib/util";

const DEFAULT_WATCH = ["NVDAUSDT", "AAPLUSDT", "TSLAUSDT", "MSFTUSDT", "SPYUSDT"];

function watchlist(): string[] {
  const raw = process.env.AETHER_WATCHLIST;
  if (!raw) return DEFAULT_WATCH;
  return raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
}

async function cycle(): Promise<unknown> {
  const kill = loadKill();
  const monitor = await tickMonitor({ flattenAll: kill.tripped });
  const entries: unknown[] = [];
  if (!loadKill().tripped) {
    for (const symbol of watchlist()) {
      if (getOpenBySymbol(symbol)) continue;
      if (loadPositions().length >= 3) break;
      const run = await runAether({ symbol, execute: true, mode: "paper" });
      entries.push({
        symbol,
        decision: (run as { decision?: string }).decision,
        execution: (run as { execution?: { orderId?: string; submitted?: boolean; preview?: boolean; mode?: string; error?: string } }).execution,
      });
    }
  }
  const snapshot = {
    ts: nowIso(),
    kill: loadKill(),
    open: loadPositions().map((p) => ({ id: p.id, symbol: p.symbol, direction: p.direction, mode: p.mode, orderId: p.orderId })),
    monitor: monitor.ticks,
    entries,
  };
  appendPaperLog(snapshot);
  return snapshot;
}

async function main() {
  if (String(process.env.AETHER_MODE || "paper").toLowerCase() !== "paper" || process.env.BITGET_PAPER === "0") {
    throw new Error("paper-loop requires AETHER_MODE=paper and BITGET_PAPER=1");
  }
  const once = process.argv.includes("--once");
  const ms = Number(process.env.AETHER_LOOP_MS || 300_000);
  if (once) {
    console.log(JSON.stringify(await cycle(), null, 2));
    return;
  }
  console.error(`paper-loop every ${ms}ms. Ctrl+C to stop. Kill switch pauses entries.`);
  while (true) {
    try {
      const snap = await cycle();
      console.log(JSON.stringify({ ts: (snap as { ts: string }).ts, kill: (snap as { kill: unknown }).kill, open: (snap as { open: unknown }).open, entries: (snap as { entries: unknown[] }).entries?.length }));
    } catch (err) {
      console.error(err);
    }
    await sleep(ms);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
