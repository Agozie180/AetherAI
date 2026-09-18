import { loadDotEnv } from "../lib/env";
loadDotEnv();

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listSettled } from "../lib/memory/store";
import { computePerformance } from "../lib/metrics/performance";
import type { SettledTrade } from "../lib/types";

/**
 * Judge-facing performance export.
 *
 * The paper-trading log (data/*.jsonl, data/*.db) is git-ignored, so this
 * writes the competition-window track record to `reports/` — which is NOT
 * git-ignored — as both machine-readable JSON and a spreadsheet-friendly CSV,
 * and prints a summary to stdout. Run: `npm run report`.
 */

function fmt(n: number | null, dp = 2): string {
  if (n === null) return "n/a";
  return n.toFixed(dp);
}

function toCsv(trades: SettledTrade[]): string {
  const header = [
    "id",
    "symbol",
    "direction",
    "mode",
    "openedAt",
    "closedAt",
    "durationMin",
    "entry",
    "exit",
    "qty",
    "leverage",
    "rMultiple",
    "pnlUsd",
    "exitReason",
    "calibrated",
    "orderId",
    "closeOrderId",
    "closeSubmitted",
  ];
  const rows = trades.map((t) =>
    [
      t.id,
      t.symbol,
      t.direction,
      t.mode,
      t.openedAt,
      t.closedAt,
      (t.durationMs / 60_000).toFixed(2),
      t.entry,
      t.exit,
      t.qty,
      t.leverage,
      t.rMultiple,
      t.pnlUsd,
      t.exitReason,
      t.calibrated,
      t.orderId ?? "",
      t.closeOrderId ?? "",
      t.closeSubmitted,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n") + "\n";
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function main() {
  const trades = listSettled(5000);
  const report = computePerformance(trades);

  const outDir = join(process.cwd(), "reports");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "performance.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(outDir, "trades.csv"), toCsv(trades));

  const L: string[] = [];
  L.push("AetherAI — paper-trading performance");
  L.push("=".repeat(42));
  L.push(`Generated:      ${report.generatedAt}`);
  L.push(`Window:         ${report.window.firstClosedAt ?? "—"}  →  ${report.window.lastClosedAt ?? "—"}`);
  L.push(`Settled trades: ${report.sampleSize}   (W ${report.wins} / L ${report.losses} / BE ${report.breakeven})`);
  L.push(`Win rate:       ${(report.winRate * 100).toFixed(1)}%`);
  L.push("");
  L.push(`Total P&L:      ${fmt(report.totalPnlUsd)} USD   (${fmt(report.totalR)} R)`);
  L.push(`Expectancy:     ${fmt(report.expectancyUsd)} USD/trade   (${fmt(report.avgR)} R/trade)`);
  L.push(`Profit factor:  ${fmt(report.profitFactor)}`);
  L.push(`Avg win / loss: ${fmt(report.avgWinUsd)} / ${fmt(report.avgLossUsd)} USD`);
  L.push(`Best / worst:   ${fmt(report.bestTradeUsd)} / ${fmt(report.worstTradeUsd)} USD`);
  L.push("");
  L.push(`Sharpe (/trade): ${fmt(report.sharpePerTrade, 3)}   Sortino (/trade): ${fmt(report.sortinoPerTrade, 3)}`);
  L.push(`Max drawdown:    ${fmt(report.maxDrawdownUsd)} USD   (${fmt(report.maxDrawdownR)} R)`);
  L.push(`Avg hold:        ${fmt(report.avgHoldMinutes)} min`);
  L.push("");
  if (report.notes.length) {
    L.push("Notes:");
    for (const note of report.notes) L.push(`  • ${note}`);
    L.push("");
  }
  L.push(`Wrote: ${join("reports", "performance.json")}  and  ${join("reports", "trades.csv")}`);
  console.log(L.join("\n"));
}

main();
