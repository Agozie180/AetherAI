"use client";

import { useEffect, useMemo, useState } from "react";

type Run = Record<string, any>;

export default function Page() {
  const [symbol, setSymbol] = useState("NVDAUSDT");
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("Why didn't you trade?");
  const [answer, setAnswer] = useState("");
  const [desk, setDesk] = useState<Record<string, any> | null>(null);
  const [perf, setPerf] = useState<Record<string, any> | null>(null);

  async function refreshDesk() {
    const res = await fetch("/api/state");
    const json = await res.json();
    if (json.ok) setDesk(json);
  }

  async function refreshPerf() {
    const res = await fetch("/api/metrics");
    const json = await res.json();
    if (json.ok) setPerf(json.report);
  }

  async function analyze(execute = false) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, execute }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "run failed");
      setRun(json.run);
      await refreshDesk();
      await refreshPerf();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function ask() {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, runId: run?.id }),
    });
    const json = await res.json();
    setAnswer(json.answer || json.error || "");
  }

  const mode = String(run?.mode ?? "paper").toUpperCase();
  const elders = (run?.elders ?? []) as { role: string; vote: string }[];
  const gates = (run?.gates ?? []) as { name: string; passed: boolean; reason: string }[];
  const items = (run?.research?.items ?? []) as { title: string; source: string; kind: string; publishedAt: string; reliability: number }[];
  const adj = (run?.confidence?.adjustments ?? []) as { name: string; delta: number; reason: string }[];

  const status = useMemo(() => (run?.decision === "NO TRADE" ? "fail" : "pass"), [run]);
  useEffect(() => { void refreshDesk(); void refreshPerf(); }, []);

  const p = perf ?? {};
  const pfmt = (n: number | null | undefined, dp = 2) => (n === null || n === undefined ? "n/a" : Number(n).toFixed(dp));
  const ppct = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : `${(Number(n) * 100).toFixed(1)}%`);

  return (
    <main className="app">
      <header className="top">
        <div className="brand">
          <h1>AETHERAI</h1>
          <p>Research → Observe → Debate → Risk-check → Execute. Bitget S2 Agentic Trading desk.</p>
        </div>
        <div>
          <span className={`badge ${mode === "LIVE" ? "live" : "paper"}`}>{mode} MODE</span>
          <span className={`badge ${desk?.kill?.tripped ? "live" : "paper"}`}>{desk?.kill?.tripped ? "KILL TRIPPED" : "KILL CLEAR"}</span>
          <span className="badge">{run?.session?.label ?? "SESSION n/a"}</span>
        </div>
      </header>

      <div className="row">
        <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
        <button disabled={busy} onClick={() => analyze(false)}>{busy ? "Running…" : "Analyze"}</button>
        {error ? <span className="fail">{error}</span> : null}
      </div>

      <section className="grid">
        <div className="panel">
          <h2>Status</h2>
          <div className="kv">
            <span>Instrument</span><div>{run?.resolved?.futures?.symbol ?? "—"} ({run?.resolved?.futures?.symbolType ?? "—"})</div>
            <span>rToken spot</span><div>{run?.resolved?.realitySpot?.symbol ?? "none mapped"}</div>
            <span>Regime</span><div>{run?.intelligence?.regime?.regime ?? "—"}</div>
            <span>Session gate</span><div>{run?.session ? `${(run.session.threshold * 100).toFixed(0)}% required` : "—"}</div>
            <span>Calibrated</span><div className={status}>{(run?.confidence?.calibrated * 100 || 0).toFixed(1)}%</div>
            <span>Decision</span><div className={status}>{run?.decision ?? "—"}</div>
          </div>
        </div>

        <div className="panel span2">
          <h2>Track record (paper)</h2>
          <div className="kv">
            <span>Settled</span><div>{p.sampleSize ?? 0} (W {p.wins ?? 0} / L {p.losses ?? 0} / BE {p.breakeven ?? 0})</div>
            <span>Win rate</span><div>{ppct(p.winRate)}</div>
            <span>Total P/L</span><div className={(p.totalPnlUsd ?? 0) >= 0 ? "pass" : "fail"}>{pfmt(p.totalPnlUsd)} USD · {pfmt(p.totalR)} R</div>
            <span>Expectancy</span><div>{pfmt(p.expectancyUsd)} USD/trade · {pfmt(p.avgR)} R/trade</div>
            <span>Profit factor</span><div>{pfmt(p.profitFactor)}</div>
            <span>Sharpe /trade</span><div>{pfmt(p.sharpePerTrade)}</div>
            <span>Sortino /trade</span><div>{pfmt(p.sortinoPerTrade)}</div>
            <span>Max drawdown</span><div>{pfmt(p.maxDrawdownUsd)} USD · {pfmt(p.maxDrawdownR)} R</div>
            <span>Best / worst</span><div>{pfmt(p.bestTradeUsd)} / {pfmt(p.worstTradeUsd)} USD</div>
            <span>Avg hold</span><div>{pfmt(p.avgHoldMinutes)} min</div>
          </div>
          {(p.notes ?? []).map((n: string, i: number) => (
            <div className="item" key={i}>{n}</div>
          ))}
        </div>

        <div className="panel">
          <h2>Why is it moving</h2>
          <p>{run?.research?.why?.headline ?? "Run analysis to load sourced research."}</p>
          <div className="kv">
            <span>Catalyst</span><div>{run?.research?.catalyst?.classification ?? "—"}</div>
            <span>CIK</span><div>{run?.research?.cik ?? "no SEC map"}</div>
          </div>
          {(run?.research?.why?.drivers ?? []).slice(0, 4).map((d: { claim: string }, i: number) => (
            <div className="item" key={i}>{d.claim}</div>
          ))}
        </div>

        <div className="panel">
          <h2>Council of Seven</h2>
          {elders.length === 0 ? <p className="item">No votes yet.</p> : elders.map((e) => (
            <div className="elder" key={e.role}>
              <span>{e.role.replace(" Elder", "")}</span>
              <strong className={e.vote === "LONG" ? "pass" : e.vote === "SHORT" ? "fail" : ""}>{e.vote}</strong>
            </div>
          ))}
          <p>{run?.council?.summary}</p>
        </div>

        <div className="panel span2">
          <h2>Research items (sourced)</h2>
          {items.slice(0, 8).map((it, i) => (
            <div className="item" key={i}>
              <strong>{it.kind}</strong> — {it.title}
              <small>{it.source} · {it.publishedAt} · reliability {it.reliability}</small>
            </div>
          ))}
        </div>

        <div className="panel">
          <h2>Confidence trace</h2>
          <div className="kv">
            <span>Raw</span><div>{((run?.confidence?.raw ?? 0) * 100).toFixed(1)}%</div>
            <span>Calibrated</span><div>{((run?.confidence?.calibrated ?? 0) * 100).toFixed(1)}%</div>
          </div>
          {adj.map((a) => (
            <div className="item" key={a.name}>
              {a.name} {a.delta.toFixed(2)} — {a.reason}
            </div>
          ))}
        </div>

        <div className="panel">
          <h2>Gates</h2>
          {gates.map((g) => (
            <div className="elder" key={g.name}>
              <span>{g.name}</span>
              <span className={g.passed ? "pass" : "fail"}>{g.passed ? "PASS" : "FAIL"}</span>
            </div>
          ))}
        </div>

        <div className="panel">
          <h2>Market</h2>
          <div className="kv">
            <span>Last</span><div>{run?.market?.ticker?.last ?? "—"}</div>
            <span>Spread bps</span><div>{run?.intelligence?.micro?.spreadBps?.toFixed?.(2) ?? "—"}</div>
            <span>Funding</span><div>{run?.market?.funding?.fundingRate ?? "—"}</div>
            <span>OI</span><div>{run?.market?.openInterest ?? "—"}</div>
            <span>MTF</span><div>{run?.intelligence?.mtf?.consensus} {(run?.intelligence?.mtf?.confluence * 100 || 0).toFixed(0)}%</div>
            <span>Flow</span><div>{run?.intelligence?.micro?.whaleNote}</div>
          </div>
        </div>

        <div className="panel">
          <h2>Execution</h2>
          <div className="kv">
            <span>Receipt</span><div>{run?.execution?.orderId ?? "—"}</div>
            <span>State</span><div>{
              !run?.execution ? "—"
              : run.execution.error ? `blocked: ${run.execution.error}`
              : run.execution.preview ? "PREVIEW — order not sent"
              : run.execution.submitted ? `submitted (${String(run.execution.mode).toUpperCase()}${run.execution.positionConfirmed ? ", confirmed" : ""})`
              : "not submitted"
            }</div>
            <span>Stop</span><div>{run?.risk?.stop || "—"}</div>
            <span>TP</span><div>{run?.risk?.takeProfit || "—"}</div>
            <span>Invalidation</span><div>{run?.risk?.invalidation || run?.noTradeReason || "—"}</div>
          </div>
        </div>

        <div className="panel">
          <h2>Open positions</h2>
          {(desk?.open ?? []).length === 0 ? <p className="item">Flat.</p> : (desk?.open ?? []).map((p: any) => (
            <div className="item" key={p.id}>
              {p.symbol} {p.direction} @ {p.entry} · {String(p.mode).toUpperCase()} {p.orderId ?? "—"}
              <small>SL {p.stop} TP {p.takeProfit} · {p.thesis}</small>
            </div>
          ))}
        </div>
        <div className="panel">
          <h2>Self-review / memory</h2>
          <p>{desk?.similar?.note ?? "No settled sample."}</p>
          {(desk?.reviews ?? []).slice(0, 4).map((r: any) => (
            <div className="item" key={r.tradeId}>
              {r.symbol} {r.directionCorrect ? "direction ok" : "direction wrong"} · {r.rMultiple?.toFixed?.(2)}R
              <small>{r.nextTime} · sample {r.sampleSize} · {r.confidenceCalibrated}</small>
            </div>
          ))}
        </div>
        <div className="panel span2">
          <h2>Ask the desk</h2>
          <div className="row">
            <input className="ask" value={question} onChange={(e) => setQuestion(e.target.value)} />
            <button className="ghost" onClick={ask}>Ask</button>
          </div>
          <div className="mono">{answer}</div>
        </div>
      </section>
      <p className="footer">
        Stock perps are discovered live from Bitget UTA v3. rToken (RAAPLUSDT) is spot, not a future.
        Missing data is NO TRADE. Execution requires Bitget credentials — paper routes to Demo (paptrading:1), live routes live. No fills are ever fabricated.
      </p>
    </main>
  );
}
