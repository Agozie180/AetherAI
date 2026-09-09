import { describe, expect, it } from "vitest";
import { normalizeInterval } from "./market";

describe("candle intervals", () => {
  it("maps 1h to Bitget 1H", () => {
    expect(normalizeInterval("1h")).toBe("1H");
    expect(normalizeInterval("4h")).toBe("4H");
    expect(normalizeInterval("1D")).toBe("1D");
    expect(normalizeInterval("5m")).toBe("5m");
  });

  it("rejects unknown intervals", () => {
    expect(() => normalizeInterval("2h")).toThrow(/Unsupported/);
  });
});
