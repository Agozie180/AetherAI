import { loadKill, loadPositions } from "../memory/store";
import { tickMonitor } from "./tick";

/**
 * In-process monitor scheduler.
 *
 * Open positions carry a broker-side TP/SL, but invalidation, regime flips, and
 * the kill switch only fire when {@link tickMonitor} runs. In the CLI that is the
 * paper-loop; inside the Next.js server it is this scheduler, started once from
 * `src/instrumentation.ts`'s `register()` hook.
 *
 * Guarantees:
 *  - single start per process (double-start guard),
 *  - no overlapping ticks (a slow tick never stacks on the next interval),
 *  - no work — and so no exchange calls — while flat,
 *  - never keeps the event loop alive on its own (`unref`).
 */

let started = false;
let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

const DEFAULT_INTERVAL_MS = 60_000;

function currentIntervalMs(): number {
  const raw = process.env.AETHER_MONITOR_INTERVAL_MS;
  if (raw === undefined || raw === "") return DEFAULT_INTERVAL_MS;
  const n = Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_INTERVAL_MS;
}

export function startMonitorScheduler(): { started: boolean; intervalMs: number; reason?: string } {
  const intervalMs = currentIntervalMs();
  if (started) return { started: true, intervalMs, reason: "already running" };
  if (intervalMs <= 0) return { started: false, intervalMs, reason: "disabled (AETHER_MONITOR_INTERVAL_MS <= 0)" };
  started = true;
  timer = setInterval(() => {
    void runOnce();
  }, intervalMs);
  // The monitor must not by itself hold the process open (matters for scripts).
  timer.unref?.();
  return { started: true, intervalMs };
}

export function stopMonitorScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

/** Exposed for tests and manual triggers. Respects the overlap guard. */
export async function runOnce(): Promise<void> {
  if (running) return;
  // Nothing to manage while flat — this keeps a public/no-keys deployment from
  // making pointless exchange calls, and positions only ever exist with keys.
  if (loadPositions().length === 0) return;
  running = true;
  try {
    await tickMonitor({ flattenAll: loadKill().tripped });
  } catch (err) {
    console.error("[aether:monitor] tick failed:", err instanceof Error ? err.message : String(err));
  } finally {
    running = false;
  }
}
