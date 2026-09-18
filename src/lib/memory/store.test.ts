import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { KillState, OpenPosition, SettledTrade, TradeReview } from "../types";

/**
 * The persistence layer is the foundation every other subsystem writes through,
 * so it is exercised directly here: round-trip fidelity, the normalized run
 * fan-out, the atomic single-row upsert, the realized-loss aggregate, and the
 * one-time migration from the legacy JSONL files.
 *
 * Each block runs in its own temp cwd with a freshly re-imported module so the
 * lazily-opened singleton DB lands in an isolated file.
 */

type Store = typeof import("./store");

const origCwd = process.cwd();

function pos(overrides: Partial<OpenPosition> = {}): OpenPosition {
  return {
    id: "p1",
    runId: "r1",
    symbol: "NVDAUSDT",
    direction: "LONG",
    qty: 10,
    entry: 100,
    stop: 95,
    takeProfit: 115,
    invalidation: "close below 95",
    invalidationPrice: 95,
    leverage: 3,
    mode: "paper",
    clientOid: "coid-1",
    openedAt: "2026-01-01T00:00:00.000Z",
    thesis: "test thesis",
    regime: "trending",
    session: "NEW_YORK",
    calibrated: 0.7,
    elders: [{ elder: "Sun Tzu", vote: "LONG" }],
    status: "open",
    ...overrides,
  };
}

function settled(overrides: Partial<SettledTrade> = {}): SettledTrade {
  return {
    ...pos(),
    status: "closed",
    closedAt: "2026-01-02T00:00:00.000Z",
    exit: 110,
    exitReason: "take_profit",
    rMultiple: 2,
    pnlUsd: 100,
    durationMs: 86_400_000,
    closeSubmitted: true,
    ...overrides,
  };
}

function review(overrides: Partial<TradeReview> = {}): TradeReview {
  return {
    tradeId: "p1",
    symbol: "NVDAUSDT",
    at: "2026-01-02T00:00:00.000Z",
    thesisCorrect: true,
    directionCorrect: true,
    confidenceCalibrated: "ok",
    eldersRight: ["Sun Tzu"],
    eldersWrong: [],
    regimeChanged: false,
    catalystNote: "n/a",
    microstructureNote: "n/a",
    tpslReasonable: true,
    executionNote: "n/a",
    nextTime: "size up",
    rMultiple: 2,
    sampleSize: 42,
    ...overrides,
  };
}

async function freshStore(dir: string): Promise<Store> {
  process.chdir(dir);
  vi.resetModules();
  return import("./store");
}

describe("store — CRUD, fan-out, aggregates", () => {
  let store: Store;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "aether-store-"));
    store = await freshStore(dir);
  });

  afterAll(() => {
    process.chdir(origCwd);
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* WAL handle may still be open on Windows; temp dir is disposable */
    }
  });

  it("round-trips a run and returns newest-first", () => {
    store.saveRun({ id: "run-a", createdAt: "2026-01-01T00:00:00.000Z", symbol: "NVDAUSDT", mode: "paper", decision: "LONG", calibrated: 0.71, payload: JSON.stringify({ hello: "world" }) });
    store.saveRun({ id: "run-b", createdAt: "2026-01-01T00:05:00.000Z", symbol: "AAPLUSDT", mode: "paper", decision: "NO TRADE", calibrated: 0.2, payload: JSON.stringify({ n: 2 }) });

    const runs = store.listRuns(10);
    expect(runs[0].id).toBe("run-b");
    expect(runs[1].id).toBe("run-a");

    const loaded = store.loadRun("run-a");
    expect(loaded?.calibrated).toBe(0.71);
    expect(JSON.parse(loaded!.payload)).toEqual({ hello: "world" });
    expect(store.loadRun("missing")).toBeUndefined();
  });

  it("fans a run payload out into the normalized child tables", () => {
    const payload = {
      research: { items: [{ kind: "news", title: "Chip demand", source: "Reuters", relevance: 0.8, reliability: 0.9, relationToThesis: "supports" }] },
      elders: [
        { elder: "Sun Tzu", role: "War Elder", vote: "LONG", direction: "LONG", confidence: 0.8, source: "deterministic" },
        { elder: "Buffett", role: "Value Elder", vote: "NO_TRADE", direction: "NO_TRADE", confidence: 0.4, source: "llm" },
      ],
      gates: [
        { name: "instrument", passed: true, critical: true, reason: "tradable" },
        { name: "spread", passed: false, critical: true, reason: "too wide" },
      ],
      risk: { leverage: 3 },
      execution: { orderId: "OID-9", symbol: "NVDAUSDT", side: "buy", qty: "10", submitted: true, mode: "paper", clientOid: "coid-9", orderStatus: "filled", submittedAt: "2026-01-01T00:00:01.000Z" },
    };
    store.saveRun({ id: "run-fan", createdAt: "2026-01-01T01:00:00.000Z", symbol: "NVDAUSDT", mode: "paper", decision: "LONG", calibrated: 0.66, payload: JSON.stringify(payload) });

    const probe = new DatabaseSync(join(dir, "data", "aether.db"));
    const count = (t: string) => (probe.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE run_id = 'run-fan'`).get() as { n: number }).n;
    expect(count("research_items")).toBe(1);
    expect(count("elder_votes")).toBe(2);
    expect(count("gates")).toBe(2);
    expect(count("orders")).toBe(1);

    const gate = probe.prepare(`SELECT passed, critical FROM gates WHERE run_id='run-fan' AND name='spread'`).get() as { passed: number; critical: number };
    expect(gate.passed).toBe(0); // boolean coerced to 0/1
    expect(gate.critical).toBe(1);

    const order = probe.prepare(`SELECT order_id, leverage FROM orders WHERE run_id='run-fan'`).get() as { order_id: string; leverage: number };
    expect(order.order_id).toBe("OID-9");
    expect(order.leverage).toBe(3);
    probe.close();
  });

  it("re-saving a run replaces its child rows (idempotent fan-out)", () => {
    const p1 = { elders: [{ elder: "A", role: "r", vote: "LONG", direction: "LONG", confidence: 0.5, source: "deterministic" }] };
    store.saveRun({ id: "run-idem", createdAt: "t", symbol: "X", mode: "paper", decision: "LONG", calibrated: 0.5, payload: JSON.stringify(p1) });
    store.saveRun({ id: "run-idem", createdAt: "t", symbol: "X", mode: "paper", decision: "LONG", calibrated: 0.5, payload: JSON.stringify(p1) });

    const probe = new DatabaseSync(join(dir, "data", "aether.db"));
    const n = (probe.prepare(`SELECT COUNT(*) AS n FROM elder_votes WHERE run_id='run-idem'`).get() as { n: number }).n;
    expect(n).toBe(1); // not duplicated
    probe.close();
  });

  it("upsertPosition adds then updates the same id atomically", () => {
    store.upsertPosition(pos({ id: "u1", entry: 100 }));
    store.upsertPosition(pos({ id: "u1", entry: 101, stop: 96 }));
    const open = store.loadPositions().filter((p) => p.id === "u1");
    expect(open).toHaveLength(1);
    expect(open[0].entry).toBe(101);
    expect(open[0].stop).toBe(96);
  });

  it("loadPositions returns only open rows; getOpenBySymbol matches by symbol", () => {
    store.upsertPosition(pos({ id: "open-1", symbol: "TSLAUSDT", status: "open" }));
    store.upsertPosition(pos({ id: "closing-1", symbol: "TSLAUSDT", status: "closing" }));
    const open = store.loadPositions();
    expect(open.some((p) => p.id === "open-1")).toBe(true);
    expect(open.some((p) => p.id === "closing-1")).toBe(false);
    expect(store.getOpenBySymbol("TSLAUSDT")?.id).toBe("open-1");
    expect(store.getOpenBySymbol("NOPEUSDT")).toBeUndefined();
  });

  it("savePositions replaces the entire open set", () => {
    store.upsertPosition(pos({ id: "stale", symbol: "OLDUSDT" }));
    store.savePositions([pos({ id: "keep-1", symbol: "KEEPUSDT" })]);
    const open = store.loadPositions();
    expect(open).toHaveLength(1);
    expect(open[0].id).toBe("keep-1");
  });

  it("realizedLossUsd sums only negative settled pnl", () => {
    store.appendSettled(settled({ id: "w", pnlUsd: 250 }));
    store.appendSettled(settled({ id: "l1", pnlUsd: -40 }));
    store.appendSettled(settled({ id: "l2", pnlUsd: -12.5 }));
    expect(store.realizedLossUsd()).toBeCloseTo(-52.5, 5);

    const tail = store.listSettled(2);
    expect(tail).toHaveLength(2);
    expect(tail[tail.length - 1].id).toBe("l2"); // ascending tail, newest last
  });

  it("appends and lists reviews newest-first", () => {
    store.appendReview(review({ tradeId: "rev-old", at: "2026-01-01T00:00:00.000Z" }));
    store.appendReview(review({ tradeId: "rev-new", at: "2026-01-03T00:00:00.000Z" }));
    const reviews = store.listReviews(10);
    expect(reviews[0].tradeId).toBe("rev-new");
  });

  it("kill switch trips, resets, and counts failed orders", () => {
    expect(store.loadKill().tripped).toBe(false);
    const tripped = store.tripKill(["daily loss limit"]);
    expect(tripped.tripped).toBe(true);
    expect(tripped.paused).toBe(true);
    expect(tripped.reasons).toContain("daily loss limit");

    store.bumpFailedOrders();
    store.bumpFailedOrders();
    expect(store.loadKill().failedOrders).toBe(2);

    const reset = store.resetKill();
    expect(reset.tripped).toBe(false);
    expect(reset.reasons).toHaveLength(0);
    expect(store.loadKill().failedOrders).toBe(0);
  });
});

describe("store — one-time JSONL migration", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "aether-migrate-"));
    const data = join(dir, "data");
    mkdirSync(data, { recursive: true });
    writeFileSync(join(data, "runs.jsonl"), JSON.stringify({ id: "legacy-run", createdAt: "2025-01-01T00:00:00.000Z", symbol: "NVDAUSDT", mode: "paper", decision: "LONG", calibrated: 0.6, payload: JSON.stringify({ legacy: true }) }) + "\n");
    writeFileSync(join(data, "settled.jsonl"), JSON.stringify(settled({ id: "legacy-trade", pnlUsd: -33 })) + "\n");
    writeFileSync(join(data, "positions.json"), JSON.stringify([pos({ id: "legacy-pos", symbol: "AAPLUSDT" })]));
    writeFileSync(join(data, "killswitch.json"), JSON.stringify({ tripped: true, paused: true, reasons: ["legacy"], flattenAttempts: 0, failedOrders: 1 } satisfies KillState));
  });

  afterAll(() => {
    process.chdir(origCwd);
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("imports legacy files on first open, then does not double-import", async () => {
    const store = await freshStore(dir);

    expect(store.loadRun("legacy-run")?.calibrated).toBe(0.6);
    expect(store.getOpenBySymbol("AAPLUSDT")?.id).toBe("legacy-pos");
    expect(store.realizedLossUsd()).toBeCloseTo(-33, 5);
    expect(store.loadKill().tripped).toBe(true);
    expect(store.loadKill().failedOrders).toBe(1);

    // Re-open the same DB (tables now non-empty): migration must not run again.
    const store2 = await freshStore(dir);
    expect(store2.listRuns(50).filter((r) => r.id === "legacy-run")).toHaveLength(1);
    expect(store2.listSettled(50).filter((t) => t.id === "legacy-trade")).toHaveLength(1);
  });
});
