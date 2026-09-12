import { describe, expect, it } from "vitest";
import { currentSession } from "./session";
import { policy } from "./policy";

describe("session policy", () => {
  it("uses 65% off-session and 70% London from the central policy", () => {
    expect(policy.sessionConfidence.OFF).toBe(0.65);
    expect(policy.sessionConfidence.LONDON).toBe(0.7);
  });

  it("labels London around 10:00 UTC", () => {
    const s = currentSession(new Date("2026-09-09T10:00:00Z"));
    expect(s.session).toBe("LONDON");
    expect(s.threshold).toBe(0.7);
  });

  it("labels overlap London-NY at 14:00 UTC", () => {
    const s = currentSession(new Date("2026-09-09T14:00:00Z"));
    expect(s.session).toBe("OVERLAP_LONDON_NY");
  });

  it("treats weekends as off-session instead of claiming a regional session", () => {
    const s = currentSession(new Date("2026-09-12T16:00:00Z"));
    expect(s.weekend).toBe(true);
    expect(s.session).toBe("OFF");
    expect(s.label).toMatch(/Weekend/);
    expect(s.threshold).toBe(policy.sessionConfidence.OFF);
  });
});
