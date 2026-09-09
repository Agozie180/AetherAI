import { policy } from "../policy";
import type { ElderVote, Vote } from "../types";

export interface CouncilResult {
  votes: Record<Vote, number>;
  agreement: number;
  consensus: Vote;
  passed: boolean;
  quorum: number;
  strongestObjection: string;
  dissent: ElderVote[];
  summary: string;
}

export function councilGate(elders: ElderVote[], quorum = policy.councilQuorum): CouncilResult {
  const votes: Record<Vote, number> = { LONG: 0, SHORT: 0, NO_TRADE: 0 };
  for (const e of elders) votes[e.vote] += 1;
  const directional: Vote = votes.LONG >= votes.SHORT ? "LONG" : "SHORT";
  const top = Math.max(votes.LONG, votes.SHORT);
  const consensus: Vote = top >= quorum ? directional : "NO_TRADE";
  const agreement = elders.length ? top / elders.length : 0;
  const passed = consensus !== "NO_TRADE" && top >= quorum;
  const objections = elders.flatMap((e) => e.objections.map((o) => ({ o, e })));
  const strongestObjection = objections[0]?.o ?? (passed ? "None recorded" : "Quorum not reached");
  const dissent = elders.filter((e) => e.vote !== consensus);
  return {
    votes,
    agreement,
    consensus,
    passed,
    quorum,
    strongestObjection,
    dissent,
    summary: passed
      ? `Council: ${top}/${elders.length} ${consensus} · Agreement ${(agreement * 100).toFixed(1)}% · Status: PASSED`
      : votes.NO_TRADE === elders.length
        ? `NO TRADE — unanimous NO_TRADE (${elders.length}/7)`
        : `NO TRADE — COUNCIL DISAGREEMENT (${votes.LONG}L/${votes.SHORT}S/${votes.NO_TRADE}N, need ${quorum})`,
  };
}
