# AetherAI

Autonomous agentic trading intelligence for **Bitget AI Hackathon Season 2**.

> Research → Understand → Observe → Reason → Debate → Risk-check → Execute → Monitor → Learn

**Primary submission track:** Agentic Trading / Event-Driven Agent  
**Default mode:** `PAPER` (Bitget Demo if keys exist, otherwise **SIMULATED** — never labeled live)

This is not a chatbot that prints BUY. Confidence is a formula. The Council of Seven can dissent. Bitget receipts are real or explicitly simulated.

## What Bitget actually has (do not fake)

| Product | Example | Futures? |
| --- | --- | --- |
| Stock perpetual | `NVDAUSDT` (`symbolType=stock`) | Yes — **this is what we trade** |
| rToken / Reality spot | `RAAPLUSDT` (`isReality=yes`) | **No** |
| Crypto perp | `BTCUSDT` | Yes — correlation / hedge only unless configured |

Live discovery (2026-09-09): **300** online stock perps on UTA v3. See `docs/FEASIBILITY.md`.

## Quick start

```bash
cd AetherAI
npm install
cp .env.example .env
npm test
npm run discover
npm run research -- NVDAUSDT
npm run run -- NVDAUSDT
npm run monitor
npm run monitor flatten
npm run paper-loop -- --once
npm run paper-loop
npm run dev
```

Desk: http://localhost:3100

## Research stack (this is the point)

| Question | Source |
| --- | --- |
| Is there a futures instrument? | Bitget `GET /api/v3/market/instruments` |
| Why did price move? | Bitget ticker/volume + BTC correlation + SEC + news |
| Filings / company | SEC EDGAR (official) |
| Headlines | Google News RSS; optional Finnhub / NewsAPI |
| Catalyst | `known` / `possible` / `none` — never one headline as truth |

Every research item stores **source, timestamp, freshness, relevance, reliability, relation to thesis**.

CLI:

```bash
npm run research -- AAPLUSDT
npm run research -- RAAPLUSDT   # should refuse futures, explain rToken is spot
```

## Architecture

See `docs/ARCHITECTURE.md` and `HACKATHON_MAPPING.md`.

Policy (session 65% off / 70% London, max 5x leverage, 4/7 quorum) lives in **one file**: `src/lib/policy.ts`.

## Keys

| Env | Required? |
| --- | --- |
| none | Public market + SEC + RSS research still works |
| `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | Configure `LLM_PROVIDER` and `LLM_MODEL` for elders + NL desk |
| `AETHER_ADMIN_TOKEN` | Required bearer token for execution, flatten, and kill-switch reset |
| `BITGET_API_KEY` + secret + passphrase | Demo/live orders. Set `BITGET_PAPER=1` for Demo (`paptrading: 1`) |
| `FINNHUB_API_KEY` / `NEWSAPI_KEY` | Optional extra news |

## Honest limitations

- No native TP1/TP2/TP3 — one Bitget preset TP/SL; extra targets are labeled reduce-only ideas.
- No public liquidation heatmap. No Bitget whale API.
- LLM cannot override the kill switch or the 5x leverage cap.

## License

MIT — hackathon entry. Trading is risky. Demo first.
