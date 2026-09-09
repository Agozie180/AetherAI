import { describe, expect, it } from "vitest";
import { councilGate } from "./gate";
import type { ElderVote } from "../types";

function v(elder: string, vote: ElderVote["vote"]): ElderVote {
  return { elder, role: elder, vote, direction: vote, confidence: 0.5, evidence: [], objections: ["obj"], risks: [], recommendation: "", source: "deterministic" };
}

describe("council gate", () => {
  it("passes 5/7 long", () => {
    const elders = [
      v("a", "LONG"), v("b", "LONG"), v("c", "LONG"), v("d", "LONG"), v("e", "LONG"),
      v("f", "NO_TRADE"), v("g", "SHORT"),
    ];
    const r = councilGate(elders, 4);
    expect(r.passed).toBe(true);
    expect(r.consensus).toBe("LONG");
    expect(r.summary).toContain("PASSED");
  });

  it("fails when quorum not met", () => {
    const elders = [
      v("a", "LONG"), v("b", "LONG"), v("c", "LONG"),
      v("d", "SHORT"), v("e", "SHORT"), v("f", "NO_TRADE"), v("g", "NO_TRADE"),
    ];
    const r = councilGate(elders, 4);
    expect(r.passed).toBe(false);
    expect(r.summary).toContain("COUNCIL DISAGREEMENT");
  });
});
