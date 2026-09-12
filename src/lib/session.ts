import type { SessionId } from "./types";
import { sessionConfidenceThreshold } from "./policy";

/** Crypto/stock-perp sessions in UTC. Not US cash-session hours. */
export function currentSession(at = new Date()): {
  session: SessionId;
  utcHour: number;
  threshold: number;
  label: string;
  weekend: boolean;
} {
  const utcHour = at.getUTCHours() + at.getUTCMinutes() / 60;
  const day = at.getUTCDay();
  const weekend = day === 0 || day === 6;
  const asia = utcHour >= 0 && utcHour < 8;
  const london = utcHour >= 7 && utcHour < 16;
  const ny = utcHour >= 13 && utcHour < 21;

  let session: SessionId = "OFF";
  if (!weekend) {
    if (london && ny) session = "OVERLAP_LONDON_NY";
    else if (asia && london) session = "OVERLAP_ASIA_LONDON";
    else if (london) session = "LONDON";
    else if (ny) session = "NEW_YORK";
    else if (asia) session = "ASIA";
  }

  const labels: Record<SessionId, string> = {
    ASIA: "Asian session",
    LONDON: "London / European session",
    NEW_YORK: "New York / US session",
    OVERLAP_LONDON_NY: "London–New York overlap",
    OVERLAP_ASIA_LONDON: "Asia–London overlap",
    OFF: weekend ? "Weekend / off-session" : "Off-session",
  };

  return {
    session,
    utcHour,
    threshold: sessionConfidenceThreshold(session),
    label: labels[session],
    weekend,
  };
}
