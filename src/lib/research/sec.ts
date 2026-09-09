import type { ResearchItem } from "../types";
import { hash, minutesSince, nowIso, uid } from "../util";

const SEC_TICKERS = "https://www.sec.gov/files/company_tickers.json";
const SEC_SUBMISSIONS = "https://data.sec.gov/submissions";

export interface SecCompany {
  cik: number;
  ticker: string;
  name: string;
  exchange?: string;
}

let tickerCache: { at: number; byTicker: Map<string, SecCompany> } | null = null;

function userAgent(): string {
  return (
    process.env.RESEARCH_USER_AGENT ||
    "AetherAI/0.1 (Bitget Hackathon S2; research@localhost)"
  );
}

async function secFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      "User-Agent": userAgent(),
      Accept: "application/json",
    },
  });
}

export async function loadSecTickers(force = false): Promise<Map<string, SecCompany>> {
  if (!force && tickerCache && Date.now() - tickerCache.at < 12 * 3600_000) {
    return tickerCache.byTicker;
  }
  const res = await secFetch(SEC_TICKERS);
  if (!res.ok) throw new Error(`SEC company_tickers HTTP ${res.status}`);
  const json = (await res.json()) as Record<string, { cik_str: number; ticker: string; title: string }>;
  const byTicker = new Map<string, SecCompany>();
  for (const row of Object.values(json)) {
    byTicker.set(row.ticker.toUpperCase(), {
      cik: row.cik_str,
      ticker: row.ticker.toUpperCase(),
      name: row.title,
    });
  }
  tickerCache = { at: Date.now(), byTicker };
  return byTicker;
}

export async function lookupSecCompany(ticker: string): Promise<SecCompany | undefined> {
  const map = await loadSecTickers();
  return map.get(ticker.toUpperCase());
}

export async function listSecCompanies(): Promise<SecCompany[]> {
  return [...(await loadSecTickers()).values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
}

function cikPad(cik: number): string {
  return String(cik).padStart(10, "0");
}

interface SecSubmission {
  name?: string;
  sic?: string;
  sicDescription?: string;
  ein?: string;
  category?: string;
  fiscalYearEnd?: string;
  stateOfIncorporation?: string;
  exchanges?: string[];
  tickers?: string[];
  filings?: {
    recent?: {
      accessionNumber?: string[];
      filingDate?: string[];
      reportDate?: string[];
      form?: string[];
      primaryDocument?: string[];
      primaryDocDescription?: string[];
    };
  };
}

const FILING_KIND: Record<string, ResearchItem["kind"]> = {
  "10-K": "filing",
  "10-Q": "filing",
  "8-K": "earnings",
  "6-K": "filing",
  "20-F": "filing",
  "4": "filing",
  "3": "filing",
  "S-1": "filing",
  "424B4": "filing",
};

export async function fetchSecResearch(ticker: string): Promise<{
  company?: SecCompany & { sic?: string; sicDescription?: string; fiscalYearEnd?: string };
  items: ResearchItem[];
  error?: string;
}> {
  const fetchedAt = nowIso();
  try {
    const company = await lookupSecCompany(ticker);
    if (!company) {
      return {
        items: [],
        error: `No SEC CIK for ticker ${ticker}. Not every Bitget stock perp maps to a US-listed SEC filer.`,
      };
    }
    const res = await secFetch(`${SEC_SUBMISSIONS}/CIK${cikPad(company.cik)}.json`);
    if (!res.ok) {
      return { company, items: [], error: `SEC submissions HTTP ${res.status}` };
    }
    const sub = (await res.json()) as SecSubmission;
    const recent = sub.filings?.recent;
    const items: ResearchItem[] = [];

    items.push({
      id: uid("co"),
      kind: "company",
      title: sub.name || company.name,
      summary: [
        `CIK ${cikPad(company.cik)}`,
        sub.sicDescription ? `SIC ${sub.sic} ${sub.sicDescription}` : null,
        sub.exchanges?.length ? `Exchanges: ${sub.exchanges.join(", ")}` : null,
        sub.fiscalYearEnd ? `Fiscal year end ${sub.fiscalYearEnd}` : null,
        sub.stateOfIncorporation ? `Incorp. ${sub.stateOfIncorporation}` : null,
      ]
        .filter(Boolean)
        .join(". "),
      source: "SEC EDGAR submissions",
      url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cikPad(company.cik)}`,
      publishedAt: fetchedAt,
      fetchedAt,
      freshnessMinutes: 0,
      relevance: 0.9,
      reliability: 0.98,
      relationToThesis: "Identity and reporting profile of the underlying issuer.",
      raw: { cik: company.cik, sic: sub.sic, exchanges: sub.exchanges },
    });

    const n = recent?.form?.length ?? 0;
    for (let i = 0; i < Math.min(n, 12); i++) {
      const form = recent!.form![i];
      const filingDate = recent!.filingDate![i];
      const reportDate = recent!.reportDate?.[i];
      const acc = recent!.accessionNumber![i];
      const doc = recent!.primaryDocument?.[i] ?? "";
      const desc = recent!.primaryDocDescription?.[i] ?? form;
      const accNodash = acc.replace(/-/g, "");
      const url = `https://www.sec.gov/Archives/edgar/data/${company.cik}/${accNodash}/${doc}`;
      const kind = FILING_KIND[form] ?? "filing";
      const publishedAt = new Date(`${filingDate}T00:00:00Z`).toISOString();
      items.push({
        id: hash(`${acc}:${form}`),
        kind,
        title: `${form} — ${desc}`,
        summary: `SEC ${form} filed ${filingDate}${reportDate ? ` (period ${reportDate})` : ""}. Accession ${acc}.`,
        source: "SEC EDGAR",
        url,
        publishedAt,
        fetchedAt,
        freshnessMinutes: minutesSince(publishedAt),
        relevance: form === "8-K" ? 0.85 : form.startsWith("10-") ? 0.8 : 0.55,
        reliability: 0.97,
        relationToThesis:
          form === "8-K"
            ? "Current-event filing. May be a known catalyst if fresh."
            : "Periodic disclosure. Context, not an automatic trade trigger.",
        raw: { form, filingDate, reportDate, accessionNumber: acc },
      });
    }

    return {
      company: {
        ...company,
        sic: sub.sic,
        sicDescription: sub.sicDescription,
        fiscalYearEnd: sub.fiscalYearEnd,
      },
      items,
    };
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : String(err) };
  }
}
