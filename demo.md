# AetherAI — 2-Minute Demo Video Script

**Bitget AI Base Camp Hackathon S2 · Agentic Trading**
Target length: **120 seconds max.** Six 20-second beats. Screen recording + voiceover.

> **Core promise the video must land:** AetherAI is an *autonomous* desk that does real
> research, debates it, sizes risk correctly, and **executes on Bitget Demo for real** —
> and when the edge isn't there, it says **NO TRADE** instead of inventing one. The honesty
> *is* the product. Never show a fabricated fill, number, or capability.

---

## Pre-flight (do this 5 minutes before recording)

**Terminal A — the live desk (browser-facing):**
```bash
npm run dev          # Next.js on http://localhost:3100 (starts the in-app monitor automation)
```

**Terminal B — the automation loop (the "agent working"):**
```bash
npm run paper-loop   # research → debate → risk → execute, every cycle, across the watchlist
```
Keep Terminal B visible in a corner during the execution beat — the JSON it prints *is* the
autonomy, on camera.

**Browser:** Chrome or Brave, full-screen, one tab: `http://localhost:3100`. Zoom 110–125%
so panels read on video. Close other tabs, hide bookmarks bar, enable Do-Not-Disturb.

**Before you hit record, confirm the desk is truthful:**
```bash
npm run trades list        # expect: settled trades: 0  (no seed data — honest empty record)
npm run test               # expect: 79 passed  (say this number on camera)
```

**One decision that changes the execution beat** — see *"Making a trade actually fire"* at the
bottom. Do that first if you want a live fill on screen.

---

## Shot list & narration

### 0:00–0:20 — Introduction  *(who + what + why it's different)*
- **On screen:** The desk header — `AETHERAI`, `PAPER MODE`, `KILL CLEAR`, session badge.
  Slow pan down the dashboard so the density registers.
- **Voiceover:**
  > "This is AetherAI — an autonomous trading desk built for Bitget's Agentic Trading track.
  > It runs a full pipeline on every symbol: research, a seven-member debate, a risk check,
  > and live execution on Bitget Demo. What makes it different is what it does when the edge
  > isn't there — it refuses to trade, and it never fabricates a result."
- **Note:** Say "autonomous" and "never fabricates" here. That's the thesis.

### 0:20–0:40 — Research analysis  *(grounded, sourced, not vibes)*
- **On screen:** Type a symbol (e.g. `NVDAUSDT`), click **Analyze**. Land on **"Why is it
  moving"** (headline, catalyst classification, SEC CIK map) and **"Research items (sourced)"**
  — scroll the sourced list showing source + timestamp + reliability score.
- **Voiceover:**
  > "Every decision starts from sourced research — live filings, news, and market structure,
  > each with a source and a reliability score. No hallucinated headlines. If the data's
  > missing or stale, that's a reason *not* to trade, not a gap to paper over."
- **Note:** Hover one research item so the `source · timestamp · reliability` line is legible.

### 0:40–1:00 — The debate + calibrated confidence  *(the "agentic" core)*
- **On screen:** **Council of Seven** panel (the seven roles and their LONG/SHORT/NO_TRADE
  votes) → **Confidence trace** (raw → calibrated, with each labeled adjustment) → **Gates**
  panel (PASS/FAIL list).
- **Voiceover:**
  > "Seven specialist agents debate the setup — trend, structure, flow, and more. Their votes
  > feed a calibrated confidence score, and then a wall of hard gates: session, microstructure,
  > multi-timeframe confluence, expected value. Every gate is visible, with its reason. Nothing
  > is a black box."
- **Note:** This is the beat that proves "agentic." Let the votes and gate reasons sit on screen.

### 1:00–1:20 — Risk sizing + execution automation  *(the money path)*
- **On screen:** **Execution** panel (stop / take-profit / invalidation) beside **Open
  positions**. Cut to **Terminal B** (`paper-loop`) mid-cycle, printing decisions and — when a
  setup clears — a submitted Bitget Demo order id. Cut back to the browser's **Open positions**
  row updating.
- **Voiceover:**
  > "When a setup clears every gate, the desk sizes the position from real account equity,
  > sets its stop and target, and routes the order to Bitget Demo — automatically, on a loop,
  > with no human in the loop. It then monitors that position tick-by-tick for stop, target,
  > and invalidation."
- **Note:** The paper-loop terminal running live *is* the automation proof. If no live fill
  during the take, see the fallback below — narrate the routing honestly either way.

### 1:20–1:40 — Track record + self-review  *(honest, measured)*
- **On screen:** **Track record (paper)** panel — settled count, win rate, expectancy, profit
  factor, per-trade Sharpe/Sortino, max drawdown, all in USD and R. Then **Self-review / memory**.
- **Voiceover:**
  > "Results are measured, not claimed — win rate, expectancy, profit factor, Sharpe, drawdown,
  > in dollars and R-multiples, straight from settled trades. The desk reviews its own closed
  > trades and remembers what worked. On day one this record is empty — because it's real, and
  > it fills only as the loop actually closes positions."
- **Note:** If settled = 0, *say so with pride* — an honest empty record beats a fake full one,
  and judges know the difference.

### 1:40–2:00 — Close  *(the honesty pitch + the ask)*
- **On screen:** Back to full dashboard; end on the footer line: *"Missing data is NO TRADE …
  No fills are ever fabricated."* Optionally flash the terminal: `79 passed`.
- **Voiceover:**
  > "AetherAI blocks execution without credentials, refuses low-edge setups, and never invents a
  > fill — the whole path is covered by seventy-nine tests. It's an agent you can actually trust
  > with a mandate. That's AetherAI. Thanks for watching."
- **Note:** End on the footer or the KILL/mode badges — a calm, trustworthy final frame.

---

## Making a trade actually fire (so the execution beat shows a live fill)

The desk is *honestly* conservative. In a quick take it will often print **NO TRADE**, because:
- **No LLM key set** → the Council runs deterministic and votes cautiously (unanimous NO_TRADE
  is common), and calibrated confidence stays low.
- **Session threshold** → the desk asks a slightly higher confidence bar at some UTC hours
  (0.65–0.70; highest in the London window). It never *closes*: Bitget stock perps trade 24/7,
  so every hour — weekends included — is tradeable; the bar only tilts a little by time of day.

To get a genuine fill on camera **without faking anything**, pick any of:
1. **Set an OpenAI key** in `.env` (`OPENAI_API_KEY=…`, `LLM_PROVIDER=openai`) so the seven
   elders reason with a real model — far more likely to find and vote a valid setup.
2. **Record any time — the market is 24/7.** Bitget stock perps never close, so you are not
   gated to a window. Liquidity and volatility do tend to be richest while the underlying US
   cash session is open (~13:30–20:00 UTC), which is a fine time to catch a live setup — but
   that is a preference, not a requirement.
3. **Widen the watchlist** in `.env` (`AETHER_WATCHLIST=`) to more names so the loop has more
   chances to find a qualifying setup per cycle.

**If it still prints NO TRADE during your take — that is a valid, on-message shot.** Narrate it:
> "Right now nothing clears the bar, so the desk stands down. That restraint is the feature."

Then show the **execution preview** (the sized order it *would* send, clearly labeled
"PREVIEW — order not sent") to prove the money path is real and ready — without a fabricated fill.

**Never** hand-insert a trade, edit the metrics, or lower a gate just for the camera. The
differentiator is that the numbers are earned.

---

## Recording & post

- **Resolution:** 1920×1080, 30fps. **Audio:** clean voiceover; no music over narration (or −24dB).
- **Pacing:** each beat is ~20s — rehearse once against a timer; the script above is written to fit.
- **Captions:** burn in the six beat labels (Intro / Research / Debate / Execution / Track record /
  Close) so a muted viewer still follows.
- **Hard cap 2:00.** If long, trim beat 2 or 3 narration first; never cut the execution beat.
- **Filename:** `aetherai-demo.mp4`.
