# Research module

AetherAI’s research layer answers **why is this asset moving?** with sourced items. It does not invent Bitget products or headlines.

## Flow

1. Resolve the Bitget instrument (`symbolType=stock` perp vs rToken spot).
2. Pull Bitget ticker (price/volume/OI/funding).
3. Map `baseCoin` → US ticker → SEC CIK.
4. Load SEC submissions (company, 10-K/10-Q/8-K/Form 4).
5. Load Google News RSS (optional Finnhub / NewsAPI).
6. Score relevance/reliability/freshness.
7. Classify catalyst: **known** | **possible** | **none**.
8. Emit `why` drivers, including BTC independence and volume vs baseline.

## Commands

```bash
npm run discover
npm run research -- NVDAUSDT
npm run research -- RAAPLUSDT   # refused: rToken is spot
```

## Honesty rules

- One headline is never treated as truth.
- Form 3/4 insider filings are not “known catalysts.”
- Stale 8-Ks are **possible**, not known.
- If SEC has no CIK, issuer research is marked incomplete.
- Missing news is a quality flag, not a fabricated feed.
