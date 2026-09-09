import { describe, expect, it } from "vitest";
import { rMultiple } from "./engine";

describe("R multiple", () => {
  it("is +2R on a long that hits 2x stop distance", () => {
    expect(rMultiple({ direction: "LONG", entry: 100, stop: 90, exit: 120 })).toBeCloseTo(2);
  });
  it("is -1R on a long stopped out", () => {
    expect(rMultiple({ direction: "LONG", entry: 100, stop: 90, exit: 90 })).toBeCloseTo(-1);
  });
});
