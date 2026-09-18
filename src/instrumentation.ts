/**
 * Next.js instrumentation hook (stable in Next 15). Runs once when the server
 * process boots. We use it to start the in-process monitor so open positions'
 * invalidation / regime / kill-switch checks fire without an external cron.
 *
 * Guarded to the Node.js runtime — the scheduler imports node:sqlite and the
 * Bitget client, neither of which belongs in the edge runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startMonitorScheduler } = await import("./lib/monitor/scheduler");
  const res = startMonitorScheduler();
  if (res.started) {
    console.error(`[aether] monitor scheduler active (every ${res.intervalMs}ms).`);
  } else {
    console.error(`[aether] monitor scheduler not started: ${res.reason}`);
  }
}
