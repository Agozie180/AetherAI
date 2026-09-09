import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

function runsPath(): string {
  return process.env.AETHER_RUNS || join(dataDir(), "runs.jsonl");
}

function paperPath(): string {
  return process.env.AETHER_PAPER_LOG || join(dataDir(), "paper-log.jsonl");
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

export function saveRun(run: StoredRun): void {
  mkdirSync(dirname(runsPath()), { recursive: true });
  appendFileSync(runsPath(), JSON.stringify(run) + "\n", "utf8");
}

export function appendPaperLog(line: unknown): void {
  mkdirSync(dirname(paperPath()), { recursive: true });
  appendFileSync(paperPath(), JSON.stringify({ createdAt: nowIso(), line }) + "\n", "utf8");
}

export function listRuns(limit = 20): StoredRun[] {
  return readJsonl<StoredRun>(runsPath()).reverse().slice(0, limit);
}

export function loadRun(id: string): StoredRun | undefined {
  return readJsonl<StoredRun>(runsPath()).find((r) => r.id === id);
}

export function similarSetupCount(): { similar: number; settled: number } {
  const n = readJsonl<StoredRun>(runsPath()).length;
  return { similar: n, settled: 0 };
}

export function rewriteRuns(runs: StoredRun[]): void {
  writeFileSync(runsPath(), runs.map((r) => JSON.stringify(r)).join("\n") + (runs.length ? "\n" : ""), "utf8");
}
