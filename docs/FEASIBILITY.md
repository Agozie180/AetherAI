# AetherAI — Hackathon research & feasibility

Researched 2026-09-09 against official Bitget S2 handbook, UTA v3 docs, Agent Hub, and **live** public API calls. Do not treat this file as marketing. Treat it as the audit baseline.

## Deadline and rules

- Handbook: https://bitget-ai.gitbook.io/bitgetai_hackathons2
- Landing: https://www.bitget.com/activity-hub/hackathon
- Submit: https://forms.gle/GyWZCMCPocgJdJon6
- Window: 2026-09-03 → **2026-09-21 23:59 UTC+8**
- Valid entry: form description + accessible demo + X post `#BitgetHackathon` `@Bitget_AI`
- Max two **independent** projects / themes
- Agentic Trading requires runnable demo + event→decision→execution + paper log (recommended ≥2 weeks of competition-period running)
- Scoring (Agentic): 50% quantitative, 50% judge (explainability, architecture, risk)

## Tracks

| Track | Bitget positioning | AetherAI |
| --- | --- | --- |
| Alpha Factory | Verifiable US-stock quant, 60d backtest / 30d OOS | Methods only. Not the prize form without that backtest. |
| **Agentic Trading** | LLM decides, senses, risk-manages, places orders | **Primary submission** |
| AI Trading Desk | AI researches; **human** decides | Dashboard + NL. Not the prize form. |

Official S2 tip: Agentic Trading on an Agentic account via Agent Hub Tools + MCP; Desk can use `bitget-signal`; Alpha can use Playbook.

## Live instrument facts (UTA v3, 2026-09-09)

`GET https://api.bitget.com/api/v3/market/instruments?category=USDT-FUTURES`

| Fact | Value | Class |
| --- | --- | --- |
| USDT-FUTURES count | 787 | AVAILABLE |
| `symbolType=stock` | **300, all online** | AVAILABLE |
| Stock perps | `NVDAUSDT`, `AAPLUSDT`, `TSLAUSDT`, `SPYUSDT`, … | AVAILABLE |
| rToken spot | `RAAPLUSDT`, `RNVDAUSDT` (`isReality=yes` on SPOT, 699) | AVAILABLE |
| rToken as futures | `RAAPLUSDT` on USDT-FUTURES → HTTP 400 | UNAVAILABLE |
| Stock min leverage | 1x | AVAILABLE |
| Stock max leverage | mostly 20x (267/300); some 5x–100x | AVAILABLE |
| Candles | `5m,15m,1H,4H,1D` work; lowercase `1h`/`4h` 400 | AVAILABLE |
| Order book / fills / OI / funding | Live on NVDAUSDT | AVAILABLE |
| Public liquidation heatmap | Not found | UNAVAILABLE |
| Long/short ratio on NVDA | V2 endpoints 400 without extra params | UNKNOWN |

## Execution APIs (official UTA v3)

| Action | Endpoint | Class |
| --- | --- | --- |
| Place order + preset TP/SL | `POST /api/v3/trade/place-order` | CONFIRMED |
| Set leverage | `POST /api/v3/account/set-leverage` | CONFIRMED |
| Positions | `GET /api/v3/position/current-position` | CONFIRMED |
| Strategy TPSL / trailing | `POST /api/v3/trade/place-strategy-order` | CONFIRMED |
| Demo | Demo API key + header `paptrading: 1` | CONFIRMED |
| Futures OCO | Docs: not supported | UNAVAILABLE |
| Native 3-level TP | One preset TP per order | UNAVAILABLE as native |

Auth: HMAC-SHA256 `ACCESS-KEY`, `ACCESS-SIGN`, `ACCESS-PASSPHRASE`, `ACCESS-TIMESTAMP`.

## Research sources we will actually use

Bitget does **not** serve earnings, 10-Ks, or analyst notes. Those must come from cited external sources or be marked missing.

| Need | Source | Class |
| --- | --- | --- |
| Price / volume / why-move structure | Bitget candles + ticker | AVAILABLE |
| Company + filings | SEC EDGAR company_tickers + submissions | CONFIRMED official |
| Headlines | Google News RSS (optional Finnhub/NewsAPI) | AVAILABLE |
| Macro / sentiment skills | bitget-signal (no key) / our session+funding+news | POSSIBLE |
| Fabricated “breaking news” | — | Forbidden |

## Policy mapping

Spec “5% leverage” is **not** a Bitget field (min leverage is 1x). Internal policy: `leverage = clamp(min(policy.maxLeverage, instrument.maxLeverage))`, where `policy.maxLeverage` defaults to **5x** and is overridable via `AETHER_MAX_LEVERAGE`; the code and the execution-safety check read that single policy value (no hardcoded cap). Separate % equity risk drives sizing.

## Disqualifiers we refuse

Fake Bitget products, fake order IDs, calling simulation live, missing X post, missing form description, S1 rename, “all traders” as the user.
