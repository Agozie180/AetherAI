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

export function reliabilityFromSource(source: string): number {
  const s = source.toLowerCase();
  if (s.includes("sec edgar")) return 0.97;
  if (s.includes("bitget")) return 0.9;
  if (s.includes("finnhub")) return 0.8;
  if (s.includes("newsapi")) return 0.75;
  if (s.includes("google news")) return 0.72;
  return 0.6;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
