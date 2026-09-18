import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { KillState, OpenPosition, SettledTrade, TradeReview } from "../types";
import { nowIso } from "../util";

/**
 * Persistence foundation.
 *
 * Backed by SQLite (`node:sqlite`, Node >= 22.5) at `data/aether.db`. The
 * schema is the one described in docs/ARCHITECTURE.md:
 *   runs, research_items, elder_votes, gates, orders, reviews
 * plus the operational tables the runtime needs (positions, settled, events,
 * killswitch). Every run is stored whole (runs.payload) AND fanned out into the
 * normalized child tables so history is genuinely queryable.
 *
 * The human/judge-readable competition log stays in `data/paper-log.jsonl`.
 * On first open, any pre-existing JSONL/JSON files are migrated in once.
 */

export interface StoredRun {
  id: string;
  createdAt: string;
  symbol: string;
  mode: string;
  decision: string;
  calibrated: number;
  payload: string;
}

let _db: DatabaseSync | null = null;

function dataDir(): string {
  // Vercel functions have a writable ephemeral /tmp filesystem, but the
  // project directory is read-only and instances do not share local state.
  // Use AETHER_DATA_DIR when durable storage is provided by the deployment;
  // otherwise keep local development on ./data and serverless demos honest.
  const dir = process.env.AETHER_DATA_DIR
    ? process.env.AETHER_DATA_DIR
    : process.env.VERCEL
      ? join("/tmp", "aetherai")
      : join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function dbFile(name: string): string {
  return join(dataDir(), name);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  symbol TEXT NOT NULL,
  mode TEXT NOT NULL,
  decision TEXT NOT NULL,
  calibrated REAL NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at);
CREATE INDEX IF NOT EXISTS idx_runs_symbol ON runs(symbol);

CREATE TABLE IF NOT EXISTS research_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  kind TEXT, title TEXT, source TEXT, url TEXT,
  published_at TEXT, freshness_min REAL,
  relevance REAL, reliability REAL, relation TEXT,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_research_run ON research_items(run_id);

CREATE TABLE IF NOT EXISTS elder_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  elder TEXT, role TEXT, vote TEXT, direction TEXT,
  confidence REAL, source TEXT,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_elder_run ON elder_votes(run_id);

CREATE TABLE IF NOT EXISTS gates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  name TEXT, passed INTEGER, critical INTEGER, reason TEXT,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_gates_run ON gates(run_id);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT, order_id TEXT, symbol TEXT, side TEXT,
  qty REAL, fill_price REAL, leverage REAL,
  simulated INTEGER, mode TEXT, client_oid TEXT, status TEXT, created_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_orders_run ON orders(run_id);

CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  run_id TEXT, symbol TEXT, direction TEXT, qty REAL,
  entry REAL, stop REAL, take_profit REAL,
  status TEXT, simulated INTEGER, order_id TEXT, client_oid TEXT,
  opened_at TEXT, payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);

CREATE TABLE IF NOT EXISTS settled (
  id TEXT PRIMARY KEY,
  run_id TEXT, symbol TEXT, direction TEXT,
  pnl_usd REAL, r_multiple REAL, closed_at TEXT, payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_settled_closed ON settled(closed_at);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id TEXT, symbol TEXT, created_at TEXT, payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL, payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS killswitch (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  tripped INTEGER, paused INTEGER, reasons TEXT,
  flatten_attempts INTEGER, failed_orders INTEGER, at TEXT
);
`;

function db(): DatabaseSync {
  if (_db) return _db;
  const d = new DatabaseSync(dbFile("aether.db"));
  d.exec("PRAGMA journal_mode = WAL;");
  d.exec("PRAGMA foreign_keys = ON;");
  d.exec(SCHEMA);
  _db = d;
  migrateFromJsonl(d);
  return d;
}

/** 0/1 helper — node:sqlite rejects JS booleans as bound params. */
function b(v: unknown): number {
  return v ? 1 : 0;
}
/** undefined -> null (node:sqlite rejects undefined). */
function nn<T>(v: T | undefined): T | null {
  return v === undefined ? null : v;
}

function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN");
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (err) {
    try {
      d.exec("ROLLBACK");
    } catch {
      /* ignore rollback failure */
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export function saveRun(run: StoredRun): void {
  tx(() => {
    db()
      .prepare(
        `INSERT OR REPLACE INTO runs (id, created_at, symbol, mode, decision, calibrated, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(run.id, run.createdAt, run.symbol, run.mode, run.decision, run.calibrated, run.payload);
    fanOutRun(run.id, run.payload);
  });
}

/** Decompose a run payload into the documented normalized tables. Best-effort:
 *  a shape change must never break the primary run insert. */
function fanOutRun(runId: string, payloadStr: string): void {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadStr) as Record<string, unknown>;
  } catch {
    return;
  }
  const d = db();
  // idempotent re-save: clear children first
  for (const t of ["research_items", "elder_votes", "gates", "orders"]) {
    d.prepare(`DELETE FROM ${t} WHERE run_id = ?`).run(runId);
  }

  try {
    const items = (((payload.research as Record<string, unknown>) ?? {}).items ?? []) as Array<Record<string, unknown>>;
    const ins = d.prepare(
      `INSERT INTO research_items (run_id, kind, title, source, url, published_at, freshness_min, relevance, reliability, relation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const i of items) {
      ins.run(
        runId,
        nn(i.kind as string),
        nn(i.title as string),
        nn(i.source as string),
        nn(i.url as string),
        nn(i.publishedAt as string),
        nn(i.freshnessMinutes as number),
        nn(i.relevance as number),
        nn(i.reliability as number),
        nn(i.relationToThesis as string),
      );
    }
  } catch {
    /* ignore research fan-out */
  }

  try {
    const elders = (payload.elders ?? []) as Array<Record<string, unknown>>;
    const ins = d.prepare(
      `INSERT INTO elder_votes (run_id, elder, role, vote, direction, confidence, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const e of elders) {
      ins.run(
        runId,
        nn(e.elder as string),
        nn(e.role as string),
        nn(e.vote as string),
        nn(e.direction as string),
        nn(e.confidence as number),
        nn(e.source as string),
      );
    }
  } catch {
    /* ignore elder fan-out */
  }

  try {
    const gates = (payload.gates ?? []) as Array<Record<string, unknown>>;
    const ins = d.prepare(
      `INSERT INTO gates (run_id, name, passed, critical, reason) VALUES (?, ?, ?, ?, ?)`,
    );
    for (const g of gates) {
      ins.run(runId, nn(g.name as string), b(g.passed), b(g.critical), nn(g.reason as string));
    }
  } catch {
    /* ignore gate fan-out */
  }

  try {
    const ex = payload.execution as Record<string, unknown> | null | undefined;
    if (ex) {
      const risk = (payload.risk as Record<string, unknown>) ?? {};
      d.prepare(
        `INSERT INTO orders (run_id, order_id, symbol, side, qty, fill_price, leverage, simulated, mode, client_oid, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        runId,
        nn(ex.orderId as string),
        nn(ex.symbol as string),
        nn(ex.side as string),
        nn(Number(ex.qty) || null),
        nn(ex.fillPrice as number),
        nn((risk.leverage as number) ?? (ex.leverageSet ? Number(ex.leverageSet) : undefined)),
        b(false), // legacy column; nothing is simulated anymore. Real state is in the run payload.
        nn(ex.mode as string),
        nn(ex.clientOid as string),
        nn(ex.orderStatus as string),
        nn(ex.submittedAt as string),
      );
    }
  } catch {
    /* ignore order fan-out */
  }
}

export function appendPaperLog(line: unknown): void {
  // Kept as an append-only JSONL competition log alongside the database.
  appendFileSync(dbFile("paper-log.jsonl"), JSON.stringify({ createdAt: nowIso(), line }) + "\n", "utf8");
}

export function appendEvent(event: unknown): void {
  db().prepare(`INSERT INTO events (created_at, payload) VALUES (?, ?)`).run(nowIso(), JSON.stringify(event));
}

export function listRuns(limit = 20): StoredRun[] {
  const rows = db()
    .prepare(
      `SELECT id, created_at AS createdAt, symbol, mode, decision, calibrated, payload
       FROM runs ORDER BY rowid DESC LIMIT ?`,
    )
    .all(limit) as unknown as StoredRun[];
  return rows;
}

export function loadRun(id: string): StoredRun | undefined {
  const row = db()
    .prepare(
      `SELECT id, created_at AS createdAt, symbol, mode, decision, calibrated, payload FROM runs WHERE id = ?`,
    )
    .get(id) as unknown as StoredRun | undefined;
  return row;
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

function positionCols(row: OpenPosition): unknown[] {
  return [
    row.id,
    nn(row.runId),
    row.symbol,
    row.direction,
    row.qty,
    row.entry,
    row.stop,
    row.takeProfit,
    row.status,
    b(false), // legacy column; positions are real (paper=Demo or live). Kept to avoid a schema migration.
    nn(row.orderId),
    nn(row.clientOid),
    nn(row.openedAt),
    JSON.stringify(row),
  ];
}

const POSITION_INSERT = `INSERT OR REPLACE INTO positions
  (id, run_id, symbol, direction, qty, entry, stop, take_profit, status, simulated, order_id, client_oid, opened_at, payload)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export function loadPositions(): OpenPosition[] {
  const rows = db().prepare(`SELECT payload FROM positions WHERE status = 'open'`).all() as Array<{ payload: string }>;
  return rows.map((r) => JSON.parse(r.payload) as OpenPosition);
}

/** Replace the entire open-positions set (monitor drops closed rows this way). */
export function savePositions(rows: OpenPosition[]): void {
  tx(() => {
    const d = db();
    d.prepare(`DELETE FROM positions`).run();
    const ins = d.prepare(POSITION_INSERT);
    for (const row of rows) ins.run(...(positionCols(row) as never[]));
  });
}

/** Atomic add-or-update of a single position by id (no read-modify-write race). */
export function upsertPosition(row: OpenPosition): void {
  db()
    .prepare(POSITION_INSERT)
    .run(...(positionCols(row) as never[]));
}

export function getOpenBySymbol(symbol: string): OpenPosition | undefined {
  const row = db()
    .prepare(`SELECT payload FROM positions WHERE symbol = ? AND status = 'open' LIMIT 1`)
    .get(symbol.toUpperCase()) as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload) as OpenPosition) : undefined;
}

// ---------------------------------------------------------------------------
// Settled trades
// ---------------------------------------------------------------------------

export function appendSettled(trade: SettledTrade): void {
  db()
    .prepare(
      `INSERT OR REPLACE INTO settled (id, run_id, symbol, direction, pnl_usd, r_multiple, closed_at, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      trade.id,
      nn(trade.runId),
      trade.symbol,
      trade.direction,
      trade.pnlUsd,
      trade.rMultiple,
      trade.closedAt,
      JSON.stringify(trade),
    );
}

export function listSettled(limit = 200): SettledTrade[] {
  const rows = db()
    .prepare(`SELECT payload FROM (SELECT payload, rowid FROM settled ORDER BY rowid DESC LIMIT ?) ORDER BY rowid ASC`)
    .all(limit) as Array<{ payload: string }>;
  return rows.map((r) => JSON.parse(r.payload) as SettledTrade);
}

export function countSettled(): number {
  const row = db().prepare(`SELECT COUNT(*) AS n FROM settled`).get() as { n: number };
  return row.n;
}

/**
 * Remove settled trades whose stored mode is neither "paper" nor "live" — i.e.
 * seed/demo artifacts that were never actually routed to Bitget (a real routed
 * trade is always mode "paper" (Demo) or "live"). Returns the removed rows so a
 * caller can back them up before discarding. The genuine track record — the
 * only thing judges should ever see scored — is never touched.
 *
 * Cleans BOTH the live `settled` table AND the `settled.jsonl` migration source.
 * The latter is essential: `migrateFromJsonl` re-seeds the table from that file
 * whenever it is empty, so a table-only delete would silently reappear on the
 * next process start.
 */
export function purgeUnrealSettled(): SettledTrade[] {
  const isReal = (t: SettledTrade) => t.mode === "paper" || t.mode === "live";
  const removed = new Map<string, SettledTrade>();

  // 1) Live DB table.
  const rows = db().prepare(`SELECT payload FROM settled`).all() as Array<{ payload: string }>;
  const del = db().prepare(`DELETE FROM settled WHERE id = ?`);
  for (const r of rows) {
    const t = JSON.parse(r.payload) as SettledTrade;
    if (!isReal(t)) {
      del.run(t.id);
      removed.set(t.id, t);
    }
  }

  // 2) Migration source (data/settled.jsonl) — rewrite keeping only real rows,
  //    so the seed cannot re-migrate. Only rewrite when it actually changes.
  const file = dbFile("settled.jsonl");
  if (existsSync(file)) {
    const all = readJsonlFile<SettledTrade>(file);
    const kept = all.filter((t) => t && t.id && isReal(t));
    if (kept.length !== all.length) {
      for (const t of all) if (t && t.id && !isReal(t)) removed.set(t.id, t);
      writeFileSync(file, kept.map((t) => JSON.stringify(t)).join("\n") + (kept.length ? "\n" : ""), "utf8");
    }
  }

  return [...removed.values()];
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export function appendReview(review: TradeReview): void {
  db()
    .prepare(`INSERT INTO reviews (trade_id, symbol, created_at, payload) VALUES (?, ?, ?, ?)`)
    .run(review.tradeId, review.symbol, review.at, JSON.stringify(review));
}

export function listReviews(limit = 50): TradeReview[] {
  const rows = db()
    .prepare(`SELECT payload FROM reviews ORDER BY rowid DESC LIMIT ?`)
    .all(limit) as Array<{ payload: string }>;
  return rows.map((r) => JSON.parse(r.payload) as TradeReview);
}

// ---------------------------------------------------------------------------
// Kill switch
// ---------------------------------------------------------------------------

const KILL_DEFAULT: KillState = {
  tripped: false,
  paused: false,
  reasons: [],
  flattenAttempts: 0,
  failedOrders: 0,
};

export function loadKill(): KillState {
  const row = db()
    .prepare(`SELECT tripped, paused, reasons, flatten_attempts, failed_orders, at FROM killswitch WHERE id = 1`)
    .get() as
    | { tripped: number; paused: number; reasons: string; flatten_attempts: number; failed_orders: number; at: string | null }
    | undefined;
  if (!row) return { ...KILL_DEFAULT };
  return {
    tripped: !!row.tripped,
    paused: !!row.paused,
    reasons: JSON.parse(row.reasons || "[]") as string[],
    flattenAttempts: row.flatten_attempts ?? 0,
    failedOrders: row.failed_orders ?? 0,
    at: row.at ?? undefined,
  };
}

export function saveKill(state: KillState): void {
  db()
    .prepare(
      `INSERT OR REPLACE INTO killswitch (id, tripped, paused, reasons, flatten_attempts, failed_orders, at)
       VALUES (1, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      b(state.tripped),
      b(state.paused),
      JSON.stringify(state.reasons ?? []),
      state.flattenAttempts ?? 0,
      state.failedOrders ?? 0,
      nn(state.at),
    );
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
  const row = db().prepare(`SELECT COALESCE(SUM(pnl_usd), 0) AS loss FROM settled WHERE pnl_usd < 0`).get() as {
    loss: number;
  };
  return row.loss ?? 0;
}

// ---------------------------------------------------------------------------
// One-time migration from the legacy JSONL/JSON files
// ---------------------------------------------------------------------------

function readJsonlFile<T>(file: string): T[] {
  try {
    return readFileSync(file, "utf8")
      .split(/\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
}

function migrateFromJsonl(d: DatabaseSync): void {
  try {
    const runsCount = (d.prepare(`SELECT COUNT(*) AS n FROM runs`).get() as { n: number }).n;
    if (runsCount === 0 && existsSync(dbFile("runs.jsonl"))) {
      for (const r of readJsonlFile<StoredRun>(dbFile("runs.jsonl"))) {
        if (r && r.id) saveRun(r);
      }
    }

    const posCount = (d.prepare(`SELECT COUNT(*) AS n FROM positions`).get() as { n: number }).n;
    if (posCount === 0 && existsSync(dbFile("positions.json"))) {
      try {
        const all = JSON.parse(readFileSync(dbFile("positions.json"), "utf8")) as OpenPosition[];
        const ins = d.prepare(POSITION_INSERT);
        for (const row of all) ins.run(...(positionCols(row) as never[]));
      } catch {
        /* ignore */
      }
    }

    const setCount = (d.prepare(`SELECT COUNT(*) AS n FROM settled`).get() as { n: number }).n;
    if (setCount === 0 && existsSync(dbFile("settled.jsonl"))) {
      for (const t of readJsonlFile<SettledTrade>(dbFile("settled.jsonl"))) if (t && t.id) appendSettled(t);
    }

    const revCount = (d.prepare(`SELECT COUNT(*) AS n FROM reviews`).get() as { n: number }).n;
    if (revCount === 0 && existsSync(dbFile("reviews.jsonl"))) {
      for (const r of readJsonlFile<TradeReview>(dbFile("reviews.jsonl"))) if (r && r.tradeId) appendReview(r);
    }

    const evCount = (d.prepare(`SELECT COUNT(*) AS n FROM events`).get() as { n: number }).n;
    if (evCount === 0 && existsSync(dbFile("events.jsonl"))) {
      const ins = d.prepare(`INSERT INTO events (created_at, payload) VALUES (?, ?)`);
      for (const e of readJsonlFile<{ createdAt?: string; event?: unknown }>(dbFile("events.jsonl"))) {
        ins.run(e.createdAt ?? nowIso(), JSON.stringify(e.event ?? e));
      }
    }

    const killCount = (d.prepare(`SELECT COUNT(*) AS n FROM killswitch`).get() as { n: number }).n;
    if (killCount === 0) {
      if (existsSync(dbFile("killswitch.json"))) {
        try {
          saveKill(JSON.parse(readFileSync(dbFile("killswitch.json"), "utf8")) as KillState);
        } catch {
          saveKill({ ...KILL_DEFAULT });
        }
      } else {
        saveKill({ ...KILL_DEFAULT });
      }
    }
  } catch {
    /* migration is best-effort; a fresh DB is always valid */
  }
}
