# AetherAI architecture

## Principle

LLM reasons. Math scores. Policy gates. Bitget executes. Memory records.

If a capability is not on Bitget, the system says so. It does not invent endpoints, symbols, or receipts.

## Runtime modes

| Mode | Meaning |
| --- | --- |
| `paper` | Default. Bitget Demo if Demo keys exist (`BITGET_PAPER=1`). Otherwise local simulation labeled **SIMULATED**. |
| `live` | Real UTA keys, `AETHER_MODE=live`. Still bounded by policy (max 5x, gates, kill switch). |
| `paused` | Observe and research only. No orders. |

The UI badge is always visible. Simulation is never called a live trade.

## Pipeline

```
Discover instrument (UTA v3, symbolType=stock)
        ↓
Research (SEC + news + Bitget price context)
        ↓
Market intelligence (MTF, technicals, book, CVD, funding, OI, regime, session)
        ↓
Thesis draft (deterministic structure + optional LLM narrative)
        ↓
Raw confidence → calibration trace
        ↓
Council of Seven Elders (structured JSON votes)
        ↓
Gates: data → research → regime → MTF → micro → catalyst → confidence
      → session → council → risk → EV → execution safety
        ↓
NO TRADE  or  execute (Bitget or SIMULATED)
        ↓
Monitor · invalidate · review · memory
```

## Modules

| Path | Responsibility | LLM? |
| --- | --- | --- |
| `src/lib/policy.ts` | Session thresholds, quorum, leverage cap, spreads | No |
| `src/lib/bitget/*` | Official UTA v3 only | No |
| `src/lib/research/*` | Why is it moving, sourced items, catalysts | Optional narrative |
| `src/lib/intelligence/*` | Indicators, structure, microstructure, regime | No |
| `src/lib/confidence/*` | Weighted evidence + visible penalties | No |
| `src/lib/council/*` | Seven distinct elders | Yes, with deterministic fallback |
| `src/lib/risk/*` | Size, TP/SL, EV, kill switch | No |
| `src/lib/execution/*` | Safety checks, Bitget place-order, receipts | No |
| `src/lib/memory/*` | Audit log, similar setups, self-review | Optional |
| `src/lib/orchestrator/*` | One run object | Coordinates |

## Data sources (research)

| Source | What | Auth |
| --- | --- | --- |
| Bitget `GET /api/v3/market/instruments` | Discover stock perps vs rToken spot | Public |
| Bitget tickers, candles, orderbook, fills, OI, funding | Price, volume, flow, derivatives | Public |
| SEC company tickers + submissions | Company, SIC, filings 10-K/10-Q/8-K | Public, User-Agent required |
| Google News RSS | Headlines with publisher + time | Public |
| Finnhub / NewsAPI | Optional if keys set | Optional |
| SpaceXAI | Elder debate, NL answers grounded in run state | `XAI_API_KEY` |

Missing critical data → **NO TRADE**, never a fabricated substitute.

## Elders

1. Technical  
2. Market Structure  
3. Microstructure  
4. Macro / Research  
5. Causal / Catalyst  
6. Risk  
7. Adversarial (must try to disprove)

Votes: `LONG` | `SHORT` | `NO_TRADE`. Default quorum 4/7, configurable in policy.

## Confidence

Not an LLM number.

```
raw = weighted evidence (MTF, regime, structure, volume, VWAP, flow, CVD,
      funding, volatility, liquidity, catalyst, correlation, psychology)
calibrated = raw + completeness + conflict + session + sample-size penalties
```

Every negative adjustment is stored and shown.

## Execution contract

Before an order:

1. Instrument is online stock perp (or explicit crypto hedge).  
2. Account/mode valid.  
3. Leverage ≤ `min(policy.maxLeverage, instrument.maxLeverage)`.  
4. Size, spread, freshness, TP/SL, exposure checks.  
5. Submit.  
6. Persist Bitget `orderId` **or** label **SIMULATED**.  
7. Re-read position/order state.

Preset Bitget TP/SL: one each. Additional targets are explicit reduce-only actions, not a fake bracket.

## Persistence

`data/aether.db` (Node `node:sqlite`) and `data/paper-log.jsonl`.  
Schema: runs, research_items, elder_votes, gates, orders, reviews.
