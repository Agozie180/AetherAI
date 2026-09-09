import type { GateResult } from "../types";

export function foldGates(gates: GateResult[]): { passed: boolean; failed: GateResult | null } {
  const failed = gates.find((g) => g.critical && !g.passed) ?? null;
  return { passed: !failed, failed };
}

export function gate(name: string, passed: boolean, reason: string, critical = true, detail?: Record<string, unknown>): GateResult {
  return { name, passed, critical, reason, detail };
}
