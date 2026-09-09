import { describe, expect, it } from "vitest";
import { whyIsItMoving } from "./whyMoving";

describe("why moving", () => {
  it("answers why not merely up/down", () => {
    const w = whyIsItMoving({
      ticker: "NVDA",
      name: "NVIDIA",
      tickerTape: {
        symbol: "NVDAUSDT", last: 100, bid: 99.9, ask: 100.1, bidSize: 1, askSize: 1,
        mark: 100, index: 100, change24h: 0.03, volume24h: 1, turnover24h: 1, fundingRate: 0, openInterest: 1, ts: Date.now(),
      },
      btcChange: -0.01,
      catalyst: { classification: "none", labels: [], supporting: [], rationale: "none found" },
      items: [],
      volumeVsBaseline: 1.8,
    });
    expect(w.question).toBe("Why is this asset moving?");
    expect(w.headline.toLowerCase()).toContain("without an identifiable catalyst");
    expect(w.drivers.some((d) => d.claim.toLowerCase().includes("independent of btc"))).toBe(true);
  });
});
