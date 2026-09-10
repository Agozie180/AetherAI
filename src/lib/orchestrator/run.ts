import { policy } from "../policy";
import type { Mode, RunRequest, Vote } from "../types";
import { nowIso, uid } from "../util";
import { bitgetConfigFromEnv, bitgetMode } from "../bitget/client";
import { resolveInstrument } from "../bitget/instruments";
import { fetchCandles, fetchMarketBundle, fetchTicker } from "../bitget/market";
import { runResearch } from "../research/engine";
import { technicalSnapshot } from "../intelligence/technicals";
import { structureSnapshot } from "../intelligence/structure";
import { conflictBlurb, microstructureSnapshot } from "../intelligence/microstructure";
import { regimeSnapshot } from "../intelligence/regime";
import { mtfSnapshot } from "../intelligence/mtf";
import { psychologySnapshot } from "../intelligence/psychology";
import { correlationSnapshot } from "../intelligence/correlation";
import { currentSession } from "../session";
import { computeConfidence } from "../confidence/engine";
import { conveneElders } from "../council/elders";
import { councilGate } from "../council/gate";
import { planRisk } from "../risk/engine";
import { evaluateKillSwitch } from "../risk/killswitch";
import { executionSafety, placeFuturesOrder } from "../execution/safety";
import { confirmFill } from "../execution/confirm";
import { fetchAccount } from "../bitget/account";
import {
  appendPaperLog,
  appendEvent,
  bumpFailedOrders,
  getOpenBySymbol,
  tripKill,
  loadKill,
  loadPositions,
  realizedLossUsd,
  saveRun,
  upsertPosition,
} from "../memory/store";
import { similarSetups } from "../memory/similar";
import { foldGates, gate } from "./gates";

export async function runAether(req: RunRequest = {}) {
  const started = Date.now();
  const configuredMode = String(process.env.AETHER_MODE || "paper").toLowerCase();
  const mode: Mode = configuredMode === "live" || configuredMode === "paused" ? configuredMode : "paper";
  const cfg = bitgetConfigFromEnv();
  const bitget = bitgetMode(cfg);
  const session = currentSession();
  const runId = uid("run");

  const killState = loadKill();
  const account = await fetchAccount(cfg);
  const requested = (req.symbol || "NVDAUSDT").toUpperCase();
  const resolved = await resolveInstrument(requested);

  if (!resolved.futures) {
    const payload = {
      id: runId,
      at: nowIso(),
      mode,
      bitget,
      session,
      resolved,
      researchAsset: resolved.researchAsset,
      decision: "NO_TRADE",
      reason: resolved.reason,
      gates: [gate("instrument", false, resolved.reason)],
    };
    saveRun({
      id: runId,
      createdAt: nowIso(),
      symbol: requested,
      mode,
      decision: "NO_TRADE",
      calibrated: 0,
      payload: JSON.stringify(payload),
    });
    return payload;
  }

  const inst = resolved.futures;
  const market = await fetchMarketBundle(inst.symbol);
  let btcChange = 0;
  let btc1h = market.candles["1H"];
  try {
    const btc = await fetchTicker("BTCUSDT");
    btcChange = btc.change24h;
    btc1h = await fetchCandles("BTCUSDT", "1H", 120);
  } catch {
    btcChange = 0;
  }

  const h1 = market.candles["1H"];
  const technicals = technicalSnapshot(h1);
  const structure = structureSnapshot(h1);
  const regime = regimeSnapshot(h1);
  const mtf = mtfSnapshot(market.candles);
  const micro = microstructureSnapshot({
    bids: market.book.bids,
    asks: market.book.asks,
    fills: market.fills,
    last: market.ticker.last,
  });
  const psychology = psychologySnapshot({
    rsi: technicals.rsi,
    fundingRate: market.funding.fundingRate,
    volumeRatio: technicals.volumeRatio,
    change24h: market.ticker.change24h,
    imbalance: micro.imbalance,
  });
  const correlation = correlationSnapshot(h1, btc1h);
  const research = await runResearch({
    instrument: inst,
    tickerTape: market.ticker,
    btcChange,
    volumeVsBaseline: technicals.volumeRatio,
  });

  const history = similarSetups({
    regime: regime.regime,
    session: session.session,
    direction: mtf.consensus,
  });
  const confidence = computeConfidence({
    mtf,
    regime,
    structure,
    technicals,
    micro,
    fundingRate: market.funding.fundingRate,
    catalyst: research.catalyst,
    correlation,
    psychology,
    session: session.session,
    quality: research.quality,
    sampleTrades: history.settled,
    historicalWinRate: history.settled >= 30 ? history.wins / history.settled : undefined,
  });

  const thesis = {
    direction: mtf.consensus as Vote,
    text: research.why.headline,
    invalidation:
      mtf.consensus === "LONG"
        ? `Invalid if 1H closes below ${structure.support}`
        : mtf.consensus === "SHORT"
          ? `Invalid if 1H closes above ${structure.resistance}`
          : "No trade thesis.",
  };

  const elders = await conveneElders({
    symbol: inst.symbol,
    mtf,
    regime,
    structure,
    technicals: {
      rsi: technicals.rsi,
      emaStack: technicals.emaStack,
      macdHist: technicals.macd.hist,
      volumeRatio: technicals.volumeRatio,
    },
    micro: {
      pressure: micro.pressure,
      spreadBps: micro.spreadBps,
      cvd: micro.cvd,
      imbalance: micro.imbalance,
      blurb: conflictBlurb({
        cvd: micro.cvd,
        imbalance: micro.imbalance,
        fundingRate: market.funding.fundingRate,
        largeSellShare:
          micro.largeTrades.filter((t) => t.side === "sell").length /
          Math.max(1, micro.largeTrades.length),
      }),
    },
    catalyst: research.catalyst,
    why: research.why,
    confidence,
    session,
    thesis,
  });
  const council = councilGate(elders);

  const staleMs = Date.now() - market.fetchedAt;
  const existing = getOpenBySymbol(inst.symbol);
  const openCount = loadPositions().length;
  const kill = evaluateKillSwitch({
    apiFailures: research.quality.failures.length,
    staleMarketMs: staleMs,
    spreadBps: micro.spreadBps,
    maxSpreadBps: policy.maxSpreadBps,
    maxStaleMs: policy.maxStaleMarketMs,
    atrShock: regime.atrPct > 0.05,
    realizedLossUsd: realizedLossUsd(),
    lossLimitUsd: policy.killSwitchLossUsd,
    failedOrders: killState.failedOrders,
  });
  if (kill.tripped) tripKill(kill.reasons);

  const risk = planRisk({
    instrument: inst,
    last: market.ticker.last,
    vote: council.passed ? council.consensus : "NO_TRADE",
    equityUsd: account.equityUsd || Number(process.env.AETHER_PAPER_EQUITY || 10_000),
    technicals,
    structure,
    micro,
    regime,
    calibrated: confidence.calibrated,
    fundingRate: market.funding.fundingRate,
    feeRate: inst.takerFeeRate || 0.0006,
  });

  const sessionPass = confidence.calibrated >= session.threshold;
  const secDown = research.quality.failures.some((f) => f.startsWith("SEC:") && f.includes("HTTP 5"));
  const researchOk = !secDown && research.quality.freshSubstantive > 0;
  const researchReason = secDown
    ? research.quality.failures.find((f) => f.startsWith("SEC:") && f.includes("HTTP 5")) ?? "SEC upstream 5xx"
    : research.quality.freshSubstantive > 0
      ? `${research.quality.freshSubstantive} fresh sourced item(s)`
      : "no fresh sourced research beyond price action";
  const gates = [
    gate("execution_mode", mode === "live" ? bitget === "live" : mode === "paper" ? bitget !== "live" : true, `configured=${mode}, exchange=${bitget}`),
    gate("account_mode", mode !== "live" || (account.source === "bitget" && !account.simulated), account.error || `account source=${account.source}`),
    gate("market_data", staleMs <= policy.maxStaleMarketMs, `staleness ${staleMs}ms`),
    gate("research", researchOk, researchReason),
    gate("instrument", resolved.tradableFutures, resolved.reason),
    gate("regime", regime.regime !== "choppy", `regime=${regime.regime}`),
    gate("mtf", mtf.consensus !== "NO_TRADE" && !mtf.conflict || mtf.confluence >= 0.6, `confluence=${mtf.confluence.toFixed(2)} consensus=${mtf.consensus}`),
    gate("microstructure", micro.spreadBps <= policy.maxSpreadBps, `spread ${micro.spreadBps.toFixed(2)} bps`),
    gate("catalyst", true, `${research.catalyst.classification}: ${research.catalyst.rationale}`, false),
    gate("confidence", sessionPass, `calibrated ${(confidence.calibrated * 100).toFixed(1)}% vs session ${(session.threshold * 100).toFixed(0)}%`),
    gate("session", sessionPass, `${session.label} threshold ${(session.threshold * 100).toFixed(0)}%`),
    gate("council", council.passed, council.summary),
    gate("kill_switch", !kill.tripped && !killState.tripped, kill.reasons.join("; ") || killState.reasons.join("; ") || "clear"),
    gate("existing_position", !existing, existing ? `Already in ${inst.symbol}` : "flat"),
    gate("exposure", openCount < policy.maxConcurrentPositions, `open ${openCount}/${policy.maxConcurrentPositions}`),
    gate("risk", risk.allowed, risk.reason),
    gate("expected_value", risk.estimatedEv > 0, `EV ${risk.estimatedEv}`),
  ];

  const safety = executionSafety({
    instrument: inst,
    tradableFutures: resolved.tradableFutures,
    plan: risk,
    staleMs,
    maxStaleMs: policy.maxStaleMarketMs,
    killTripped: kill.tripped,
    mode,
  });
  gates.push(gate("execution_safety", safety.passed, safety.steps.filter((s) => !s.ok).map((s) => s.name).join(",") || "ok"));

  const folded = foldGates(gates);
  const shouldExecute =
    Boolean(req.execute) && folded.passed && mode !== "paused" && !killState.tripped && !kill.tripped;
  let execution = null;
  if (shouldExecute && council.consensus !== "NO_TRADE") {
    execution = await placeFuturesOrder({
      cfg,
      instrument: inst,
      vote: council.consensus,
      plan: risk,
      execute: true,
      mode,
      runId,
    });
    if (execution.error) bumpFailedOrders();
    else {
      execution = await confirmFill({
        receipt: execution,
        mark: market.ticker.last,
        qty: risk.qty,
        cfg,
      });
      if (execution.error) bumpFailedOrders();
      else if (council.consensus === "LONG" || council.consensus === "SHORT") {
        upsertPosition({
          id: uid("pos"),
          runId,
          symbol: inst.symbol,
          direction: council.consensus,
          qty: execution.fillQty || risk.qty,
          entry: execution.fillPrice || market.ticker.last,
          stop: risk.stop,
          takeProfit: risk.takeProfit,
          invalidation: risk.invalidation,
          invalidationPrice: council.consensus === "LONG" ? structure.support : structure.resistance,
          leverage: risk.leverage,
          simulated: execution.simulated,
          mode: execution.simulated ? "simulated" : mode,
          orderId: execution.orderId,
          clientOid: execution.clientOid,
          openedAt: nowIso(),
          thesis: thesis.text,
          regime: regime.regime,
          session: session.session,
          calibrated: confidence.calibrated,
          elders: elders.map((e) => ({ elder: e.elder, vote: e.vote })),
          status: "open",
        });
        appendEvent({ type: "OPEN", symbol: inst.symbol, execution });
      }
    }
  } else if (folded.passed && council.consensus !== "NO_TRADE") {
    execution = await placeFuturesOrder({
      cfg,
      instrument: inst,
      vote: council.consensus,
      plan: risk,
      execute: false,
      mode,
      runId,
    });
  }

  const decision = folded.passed && council.consensus !== "NO_TRADE" ? `EXECUTE ${council.consensus}` : "NO TRADE";
  const noTradeReason = folded.failed?.reason ?? (decision === "NO TRADE" ? council.summary : undefined);

  const payload = {
    id: runId,
    at: nowIso(),
    durationMs: Date.now() - started,
    mode,
    bitget,
    session,
    resolved: {
      ...resolved,
      futures: inst,
      realitySpot: resolved.realitySpot
        ? { symbol: resolved.realitySpot.symbol, category: "SPOT", isReality: true }
        : undefined,
    },
    market: {
      ticker: market.ticker,
      funding: market.funding,
      openInterest: market.openInterest,
      bookTop: { bid: market.book.bids[0], ask: market.book.asks[0] },
    },
    intelligence: { technicals, structure, regime, mtf, micro, psychology, correlation },
    research,
    thesis,
    confidence,
    elders,
    council,
    risk,
    kill,
    gates,
    safety,
    decision,
    noTradeReason,
    execution,
    account,
    openCount,
    history,
    policy: {
      maxLeverage: policy.maxLeverage,
      quorum: policy.councilQuorum,
      sessionThresholds: policy.sessionConfidence,
    },
  };

  saveRun({
    id: runId,
    createdAt: payload.at,
    symbol: inst.symbol,
    mode,
    decision,
    calibrated: confidence.calibrated,
    payload: JSON.stringify(payload),
  });
  appendPaperLog({
    ts: payload.at,
    symbol: inst.symbol,
    decision,
    calibrated: confidence.calibrated,
    council: council.summary,
    orderId: execution?.orderId ?? null,
    simulated: execution?.simulated ?? true,
  });
  return payload;
}
