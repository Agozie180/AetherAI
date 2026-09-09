import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { KillState, OpenPosition, SettledTrade, TradeReview } from "../types";
import { nowIso } from "../util";

export interface StoredRun {
  id: string;
  createdAt: string;
  symbol: string;
  mode: string;
  decision: string;
  calibrated: number;
  payload: string;
}

function dataDir(): string {
  const dir = join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function p(name: string): string {
  return join(dataDir(), name);
}

function readJsonl<T>(file: string): T[] {
  try {
    const raw = readFileSync(file, "utf8");
    return raw
      .split(/\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function saveRun(run: StoredRun): void {
  mkdirSync(dirname(p("runs.jsonl")), { recursive: true });
  appendFileSync(p("runs.jsonl"), JSON.stringify(run) + "\n", "utf8");
}

export function appendPaperLog(line: unknown): void {
  appendFileSync(p("paper-log.jsonl"), JSON.stringify({ createdAt: nowIso(), line }) + "\n", "utf8");
}

export function appendEvent(event: unknown): void {
  appendFileSync(p("events.jsonl"), JSON.stringify({ createdAt: nowIso(), event }) + "\n", "utf8");
}

export function listRuns(limit = 20): StoredRun[] {
  return readJsonl<StoredRun>(p("runs.jsonl")).reverse().slice(0, limit);
}

export function loadRun(id: string): StoredRun | undefined {
  return readJsonl<StoredRun>(p("runs.jsonl")).find((r) => r.id === id);
}

export function loadPositions(): OpenPosition[] {
  return readJson<OpenPosition[]>(p("positions.json"), []).filter((x) => x.status === "open");
}

export function savePositions(rows: OpenPosition[]): void {
  writeFileSync(p("positions.json"), JSON.stringify(rows, null, 2), "utf8");
}

export function upsertPosition(row: OpenPosition): void {
  const all = readJson<OpenPosition[]>(p("positions.json"), []);
  const i = all.findIndex((p0) => p0.id === row.id);
  if (i >= 0) all[i] = row;
  else all.push(row);
  savePositions(all);
}

export function getOpenBySymbol(symbol: string): OpenPosition | undefined {
  return loadPositions().find((p0) => p0.symbol === symbol.toUpperCase() && p0.status === "open");
}

export function appendSettled(trade: SettledTrade): void {
  appendFileSync(p("settled.jsonl"), JSON.stringify(trade) + "\n", "utf8");
}

export function listSettled(limit = 200): SettledTrade[] {
  return readJsonl<SettledTrade>(p("settled.jsonl")).slice(-limit);
}

export function appendReview(review: TradeReview): void {
  appendFileSync(p("reviews.jsonl"), JSON.stringify(review) + "\n", "utf8");
}

export function listReviews(limit = 50): TradeReview[] {
  return readJsonl<TradeReview>(p("reviews.jsonl")).reverse().slice(0, limit);
}

export function loadKill(): KillState {
  return readJson<KillState>(p("killswitch.json"), {
    tripped: false,
    paused: false,
    reasons: [],
    flattenAttempts: 0,
    failedOrders: 0,
  });
}

export function saveKill(state: KillState): void {
  writeFileSync(p("killswitch.json"), JSON.stringify(state, null, 2), "utf8");
}

export function tripKill(reasons: string[]): KillState {
  const prev = loadKill();
  const next: KillState = {
    ...prev,
    tripped: true,
    paused: true,
    reasons: [...new Set([...prev.reasons, ...reasons])],
    at: nowIso(),
  };
  saveKill(next);
  appendEvent({ type: "KILL_SWITCH", reasons: next.reasons });
  return next;
}

export function resetKill(): KillState {
  const next: KillState = { tripped: false, paused: false, reasons: [], flattenAttempts: 0, failedOrders: 0, at: nowIso() };
  saveKill(next);
  appendEvent({ type: "KILL_RESET" });
  return next;
}

export function bumpFailedOrders(): KillState {
  const prev = loadKill();
  const next = { ...prev, failedOrders: prev.failedOrders + 1 };
  saveKill(next);
  return next;
}

export function realizedLossUsd(): number {
  return listSettled().reduce((s, t) => s + Math.min(0, t.pnlUsd), 0);
}
