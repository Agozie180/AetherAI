# HACKATHON_MAPPING.md

**Event:** Bitget AI Base Camp Hackathon S2 — *Build What Trades Next*  
**Official handbook:** https://bitget-ai.gitbook.io/bitgetai_hackathons2  
**Deadline:** 2026-09-21 23:59 UTC+8  
**Primary submission:** Agentic Trading → Event-Driven Agent  
**One project. Three visible capabilities. One prize form.**

AetherAI is **not** three apps. It is one autonomous desk. We submit **one** entry. Claiming three Theme Prizes with the same repo would violate the independent-project rule.

## Prize form (what we enter)

| Field | Value |
| --- | --- |
| Track | Agentic Trading |
| Sub-theme | Event-Driven Agent |
| Secondary overlap (not a second form) | Market Sentiment, Earnings-Driven, Cross-Asset Execution, AI Trading Desk surfaces |
| Mode shown to judges | PAPER / Bitget Demo by default. LIVE only with real receipts |

## Capability map

| AetherAI capability | Bitget track | Sub-theme | Evidence judges can inspect | Demo moment |
| --- | --- | --- | --- | --- |
| Discover live `symbolType=stock` perps | Agentic Trading | Event-Driven / Cross-Asset | `GET /api/v3/market/instruments` via `/api/instruments` | Desk shows NVDAUSDT as stock perp, RAAPLUSDT as spot-only |
| Research: why is it moving | Agentic + Desk | Event-Driven / Information Extraction | SEC EDGAR + news RSS + Bitget price, each item sourced | Research panel: source, timestamp, freshness, reliability |
| Catalyst class known / possible / none | Agentic | Event-Driven / Earnings-Driven | `catalyst` object in run JSON | “No identifiable catalyst” is a first-class output |
| MTF 5m/15m/1H/4H/1D confluence | Agentic + Alpha-like | Open (quant methods) | Deterministic scores in `intelligence.mtf` | Confluence number, not a vibe |
| Order book / CVD / funding / OI | Agentic | Event-Driven | Live Bitget public market data | Conflicting flow shown, not flattened to “bullish” |
| Session gate 65% off / 70% London | Agentic | Event-Driven | `src/lib/policy.ts` | Status bar: session, threshold, pass/fail |
| 7 Elders with adversarial dissent | Agentic | Open architecture | `council.elders[]` votes | 5/7 LONG, Adversarial SHORT, strongest objection |
| Evidence-based confidence | Agentic | All | `confidence.trace` | Raw → penalties → calibrated. No LLM 73% |
| Risk + 5x leverage cap + EV | Agentic | All | Policy engine; LLM cannot override | NO TRADE if EV negative |
| Bitget Demo/live order + `orderId` | Agentic | Event-Driven | Persisted receipt or **SIMULATED** label | Never fake an order id |
| Post-trade self-review | Desk | Review & Self-Evolution | Memory store | “Similar setups: n; sample insufficient” |
| NL questions over stored state | Desk | Personalized Workbench | `/api/ask` | “Why didn’t you trade?” answers from gates |

## What we will not claim

| Claim | Why not |
| --- | --- |
| rToken futures (`RAAPLUSDT` perp) | Live API: `RAAPLUSDT` is SPOT `isReality=yes`. Futures ticker is `AAPLUSDT`. |
| Native TP1/TP2/TP3 | UTA place-order supports **one** preset TP and **one** SL. Extra targets are reduce-only / strategy orders, labeled as such. |
| Exchange liquidation heatmap | No public Bitget futures liquidation tape found. Account `liquidationPrice` only. |
| Bitget whale API | Not in official UTA market data. Large prints inferred from public fills. `large-flow-detect` is Agent Hub “coming next”. |
| Alpha Factory Theme Prize | Requires ≥60d backtest and ≥30d OOS. Not our form unless Playbook evidence exists. |
| AI Trading Desk as the prize track | That track wants **human** final decisions. Our agent executes when gates pass. Desk is the explainability surface. |
| Live trade without Bitget confirmation | Receipts require `orderId` from Bitget, or the row is **SIMULATED**. |

## Judging alignment (Agentic Trading)

Handbook scoring: **50% quantitative + 50% judge**.

| Judge axis | How AetherAI shows it |
| --- | --- |
| Paper trading log in competition window | `data/paper-log.jsonl` + Demo `orderId` when keys exist |
| Decision explainability | Gate stack, confidence trace, elder votes, research sources |
| Agent architecture | Seven distinct elders + deterministic risk officer |
| Risk control effectiveness | Kill switch, 5x cap, session/EV/council gates, no-trade engine |

## Official toolkit we actually use

| Tool | Use |
| --- | --- |
| UTA v3 REST | Market data, instruments, orders, leverage, positions |
| Bitget Demo (`paptrading: 1`) | Paper execution |
| Agent Hub / `bitget-agent-sdk` | Optional later; first-party REST is the source of truth |
| `bitget-signal` skills | Perception inspiration; we reimplement research with cited sources so the desk is inspectable without MCP |
| Playbook | Not required for Agentic Trading |
| SpaceXAI (`XAI_API_KEY`, `https://api.x.ai/v1`, `grok-4.6`) | Elders + NL desk. Deterministic fallback if no key |

## Submission checklist (disqualifiers)

- [ ] Google Form six-part description (not a README substitute)
- [ ] Role of the LLM field
- [ ] Accessible demo URL
- [ ] Paper trading log from the competition period
- [ ] X post with `#BitgetHackathon` and `@Bitget_AI`
- [ ] Track + sub-theme selected
- [ ] No S1 clone
