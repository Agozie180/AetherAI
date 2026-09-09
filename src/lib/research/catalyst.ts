import type { CatalystClass, ResearchItem } from "../types";

const KNOWN_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bearnings\b|\beps\b|\bguidance\b|\b8-k\b|\b10-q\b|\b10-k\b/i, label: "earnings_or_filing" },
  { re: /\bfed\b|\bfomc\b|\brate cut\b|\brate hike\b|\bcpi\b|\binflation\b|\bnfp\b/i, label: "macro" },
  { re: /\bmerger\b|\bacquisition\b|\btakeover\b|\bbuyback\b|\bdividend\b/i, label: "corporate_action" },
  { re: /\blawsuit\b|\bregulator\b|\bantitrust\b|\binvestigation\b/i, label: "regulatory" },
  { re: /\bwar\b|\bsanction\b|\bgeopolit/i, label: "geopolitical" },
  { re: /\bupgrade\b|\bdowngrade\b|\bprice target\b|\banalyst\b/i, label: "analyst" },
];

export interface CatalystReport {
  classification: CatalystClass;
  labels: string[];
  primary?: ResearchItem;
  supporting: ResearchItem[];
  rationale: string;
}

export function classifyCatalyst(items: ResearchItem[], maxKnownAgeHours = 48): CatalystReport {
  const now = Date.now();
  const scored = items
    .map((it) => {
      const labels = KNOWN_PATTERNS.filter((p) => p.re.test(`${it.title} ${it.summary}`)).map((p) => p.label);
      const ageH = (now - Date.parse(it.publishedAt)) / 3600_000;
      const fresh = Number.isFinite(ageH) ? ageH <= maxKnownAgeHours : false;
      const weight = it.relevance * it.reliability * (fresh ? 1 : 0.35) * (labels.length ? 1.2 : 0.7);
      return { it, labels, ageH, fresh, weight };
    })
    .sort((a, b) => b.weight - a.weight);

  const known = scored.filter((s) => {
    const strongForm = /8-K|10-Q|10-K|earnings|eps|guidance|merger|acquisition|fomc|cpi/i.test(
      `${s.it.title} ${s.it.summary} ${s.it.kind}`,
    );
    const insiderOnly = /^[34]\b|form 3|form 4/i.test(s.it.title);
    return s.labels.length && s.fresh && s.it.reliability >= 0.75 && strongForm && !insiderOnly;
  });
  const possible = scored.filter((s) => s.labels.length || (s.fresh && s.it.kind === "news"));

  if (known.length) {
    const labels = [...new Set(known.flatMap((k) => k.labels))];
    return {
      classification: "known",
      labels,
      primary: known[0].it,
      supporting: known.slice(1, 4).map((k) => k.it),
      rationale: `Fresh sourced item (${known[0].it.source}, ${known[0].it.publishedAt}) matches ${labels.join(", ")}. Still not treated as sole truth.`,
    };
  }
  if (possible.length) {
    return {
      classification: "possible",
      labels: [...new Set(possible.flatMap((p) => p.labels))],
      primary: possible[0].it,
      supporting: possible.slice(1, 3).map((p) => p.it),
      rationale: "Headlines or filings exist but are stale, weakly sourced, or not clearly causal.",
    };
  }
  return {
    classification: "none",
    labels: [],
    supporting: [],
    rationale: "No identifiable catalyst in SEC filings or news window. Price action may be technical, flow, or unexplained.",
  };
}

export function scoreCatalystForConfidence(c: CatalystReport): number {
  if (c.classification === "known") return 0.72;
  if (c.classification === "possible") return 0.5;
  return 0.42;
}
