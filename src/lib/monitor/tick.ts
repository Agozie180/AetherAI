import { policy } from "../policy";
import { bitgetConfigFromEnv } from "../bitget/client";
import { fetchCandles, fetchOrderBook, fetchTicker } from "../bitget/market";
import { closePosition } from "../execution/close";
import {
  appendEvent,
  appendReview,
  appendSettled,
  loadKill,
  loadPositions,
  realizedLossUsd,
  savePositions,
  tripKill,
} from "../memory/store";
import { reviewTrade, rMultiple } from "../review/engine";
import { atr } from "../intelligence/technicals";
import { regimeSnapshot } from "../intelligence/regime";
import { evaluatePosition, exitReasonOf } from "./engine";
import type { OpenPosition, SettledTrade } from "../types";
import { nowIso } from "../util";

export async function tickMonitor(opts?: { flattenAll?: boolean }): Promise<{
  ticks: unknown[];
  kill: ReturnType<typeof loadKill>;
  open: OpenPosition[];
}> {
  const cfg = bitgetConfigFromEnv();
  let opens = loadPositions();
  const ticks: unknown[] = [];
  let apiFailures = 0;

  if (opts?.flattenAll || loadKill().tripped) {
    for (const pos of opens) {
      const mark = await fetchTicker(pos.symbol).then((t) => t.last).catch(() => pos.entry);
      const closed = await settle(pos, mark, "kill_switch", cfg);
      ticks.push({ symbol: pos.symbol, action: "KILL_FLATTEN", closed });
    }
    const kill = tripKill(loadKill().reasons.length ? loadKill().reasons : ["Flatten requested."]);
    kill.flattenAttempts += 1;
    return { ticks, kill: loadKill(), open: loadPositions() };
  }

  for (const pos of opens) {
    const t0 = Date.now();
    try {
      const [ticker, book, c1h] = await Promise.all([
        fetchTicker(pos.symbol),
        fetchOrderBook(pos.symbol, 10),
        fetchCandles(pos.symbol, "1H", 80),
      ]);
      const staleMs = Date.now() - t0;
      const bestBid = book.bids[0]?.price ?? ticker.bid;
      const bestAsk = book.asks[0]?.price ?? ticker.ask;
      const mid = (bestBid + bestAsk) / 2 || ticker.last;
      const spreadBps = mid ? ((bestAsk - bestBid) / mid) * 10_000 : 0;
      const a = atr(c1h, 14);
      const atrPct = ticker.last ? a / ticker.last : 0;
      const regime = regimeSnapshot(c1h);
      const decision = evaluatePosition({
        position: pos,
        mark: ticker.last || ticker.mark,
        candles1h: c1h,
        spreadBps,
        staleMs,
        apiFailures,
        realizedLossUsd: realizedLossUsd(),
        failedOrders: loadKill().failedOrders,
        atrPct,
        regime: regime.regime,
        killAlready: loadKill().tripped,
      });
      appendEvent({ type: "MONITOR", symbol: pos.symbol, decision });
      ticks.push({ symbol: pos.symbol, ...decision, regime: regime.regime, funding: ticker.fundingRate });

      if (decision.action === "KILL_FLATTEN") {
        tripKill([decision.reason]);
        const closed = await settle(pos, ticker.last, "kill_switch", cfg);
        ticks.push({ flatten: pos.symbol, closed });
        continue;
      }
      if (decision.action === "CLOSE") {
        await settle(pos, ticker.last, exitReasonOf(decision), cfg);
      }
    } catch (err) {
      apiFailures += 1;
      ticks.push({ symbol: pos.symbol, error: err instanceof Error ? err.message : String(err) });
      if (apiFailures >= 3) {
        tripKill(["Repeated API failures during monitor."]);
      }
    }
  }

  return { ticks, kill: loadKill(), open: loadPositions() };
}

async function settle(
  pos: OpenPosition,
  mark: number,
  reason: string,
  cfg: ReturnType<typeof bitgetConfigFromEnv>,
): Promise<SettledTrade | { error: string }> {
  const close = await closePosition({ position: pos, mark, cfg, reason });
  if (!close.ok) return { error: close.error ?? "close failed" };
  const exit = close.exit;
  const rm = rMultiple({ direction: pos.direction, entry: pos.entry, exit, stop: pos.stop });
  const qty = pos.qty;
  const pnlUsd = pos.direction === "LONG" ? (exit - pos.entry) * qty : (pos.entry - exit) * qty;
  const settled: SettledTrade = {
    ...pos,
    status: "closed",
    closedAt: nowIso(),
    exit,
    exitReason: reason,
    rMultiple: rm,
    pnlUsd,
    durationMs: Date.parse(nowIso()) - Date.parse(pos.openedAt),
    closeOrderId: close.orderId,
    closeSubmitted: close.submitted,
  };
  appendSettled(settled);
  const remaining = loadPositions().filter((p) => p.id !== pos.id);
  savePositions(remaining);
  const review = reviewTrade(settled);
  appendReview(review);
  appendEvent({ type: "CLOSE", settled, review });
  return settled;
}

export async function flattenAll(reason = "manual flatten"): Promise<{
  ticks: unknown[];
  kill: ReturnType<typeof loadKill>;
  open: OpenPosition[];
}> {
  tripKill([reason]);
  return tickMonitor({ flattenAll: true });
}
