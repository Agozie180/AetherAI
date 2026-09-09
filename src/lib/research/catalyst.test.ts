import { describe, expect, it } from "vitest";
import { classifyCatalyst } from "./catalyst";
import type { ResearchItem } from "../types";

function item(over: Partial<ResearchItem>): ResearchItem {
  return {
    id: "1",
    kind: "news",
    title: "x",
    summary: "",
    source: "test",
    publishedAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    freshnessMinutes: 10,
    relevance: 0.8,
    reliability: 0.9,
    relationToThesis: "",
    ...over,
  };
}

describe("catalyst", () => {
  it("classifies none when empty", () => {
    expect(classifyCatalyst([]).classification).toBe("none");
  });

  it("classifies known on fresh 8-K", () => {
    const c = classifyCatalyst([item({ kind: "earnings", title: "8-K earnings beat", source: "SEC EDGAR" })]);
    expect(c.classification).toBe("known");
  });

  it("classifies possible on stale news", () => {
    const old = new Date(Date.now() - 10 * 86400_000).toISOString();
    const c = classifyCatalyst([item({ title: "merger rumors", publishedAt: old, freshnessMinutes: 10 * 24 * 60, reliability: 0.6 })]);
    expect(["possible", "none"]).toContain(c.classification);
  });
});
