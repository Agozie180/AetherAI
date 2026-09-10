import type { ResearchItem } from "../types";

export function scoreRelevance(item: ResearchItem, ticker: string, name?: string): ResearchItem {
  const t = ticker.toUpperCase();
  const blob = `${item.title} ${item.summary}`.toUpperCase();
  let rel = item.relevance;
  if (blob.includes(t)) rel += 0.15;
  if (name && blob.includes(name.toUpperCase().slice(0, 18))) rel += 0.1;
  if (item.kind === "filing" || item.kind === "earnings") rel += 0.08;
  if (item.freshnessMinutes < 180) rel += 0.08;
  else if (item.freshnessMinutes > 7 * 24 * 60) rel -= 0.2;
  return { ...item, relevance: clamp01(rel) };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
