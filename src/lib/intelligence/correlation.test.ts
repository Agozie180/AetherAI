import { describe, expect, it } from "vitest";
import { pearson } from "./correlation";

describe("correlation", () => {
  it("returns ~1 for identical series", () => {
    const a = Array.from({ length: 20 }, (_, i) => i);
    expect(pearson(a, a)).toBeCloseTo(1, 8);
  });
});
