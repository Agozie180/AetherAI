export interface KillEvent {
  tripped: boolean;
  reasons: string[];
}

export function evaluateKillSwitch(input: {
  apiFailures: number;
  staleMarketMs: number;
  spreadBps: number;
  maxSpreadBps: number;
  maxStaleMs: number;
  atrShock: boolean;
  realizedLossUsd: number;
  lossLimitUsd: number;
  failedOrders: number;
}): KillEvent {
  const reasons: string[] = [];
  if (input.apiFailures >= 3) reasons.push("Repeated API failures.");
  if (input.staleMarketMs > input.maxStaleMs) reasons.push("Stale market data.");
  if (input.spreadBps > input.maxSpreadBps * 2) reasons.push("Abnormal spread.");
  if (input.atrShock) reasons.push("Unexpected volatility shock.");
  if (input.realizedLossUsd <= -Math.abs(input.lossLimitUsd)) reasons.push("Loss limit.");
  if (input.failedOrders >= 3) reasons.push("Repeated failed orders.");
  return { tripped: reasons.length > 0, reasons };
}
