import type { ResearchItem } from "../types";
import { hash, minutesSince, nowIso } from "../util";

export async function fetchNewsResearch(query: string, ticker: string): Promise<{
  items: ResearchItem[];
  errors: string[];
}> {
  const errors: string[] = [];
  const buckets = await Promise.allSettled([
    googleNewsRss(query, ticker),
    finnhubNews(ticker),
    newsApi(query),
  ]);
  const items: ResearchItem[] = [];
  for (const b of buckets) {
    if (b.status === "fulfilled") items.push(...b.value.items);
    else errors.push(b.reason instanceof Error ? b.reason.message : String(b.reason));
  }
  const seen = new Set<string>();
  const deduped: ResearchItem[] = [];
  for (const it of items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))) {
    const key = it.title.toLowerCase().replace(/\W+/g, " ").slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(it);
  }
  return { items: deduped.slice(0, 20), errors: errors.filter(Boolean) };
}

async function googleNewsRss(query: string, ticker: string): Promise<{ items: ResearchItem[] }> {
  const q = encodeURIComponent(`${query} OR ${ticker} stock`);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { headers: { "User-Agent": "AetherAI/0.1" } });
  if (!res.ok) throw new Error(`Google News RSS HTTP ${res.status}`);
  const xml = await res.text();
  return { items: parseRss(xml, "Google News RSS", 0.72) };
}

function parseRss(xml: string, source: string, reliability: number): ResearchItem[] {
  const fetchedAt = nowIso();
  const items: ResearchItem[] = [];
  const blocks = xml.split(/<item>/i).slice(1);
  for (const block of blocks.slice(0, 15)) {
    const title = decode(tag(block, "title"));
    const link = decode(tag(block, "link"));
    const pub = tag(block, "pubDate") || tag(block, "published");
    const desc = strip(decode(tag(block, "description")));
    if (!title) continue;
    const publishedAt = pub ? new Date(pub).toISOString() : fetchedAt;
    items.push({
      id: hash(title + link),
      kind: "news",
      title,
      summary: desc.slice(0, 400) || title,
      source,
      url: link || undefined,
      publishedAt,
      fetchedAt,
      freshnessMinutes: minutesSince(publishedAt),
      relevance: 0.6,
      reliability,
      relationToThesis: "Unstructured headline. Not treated as ground truth.",
    });
  }
  return items;
}

async function finnhubNews(ticker: string): Promise<{ items: ResearchItem[] }> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return { items: [] };
  const to = new Date();
  const from = new Date(Date.now() - 7 * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(ticker)}&from=${fmt(from)}&to=${fmt(to)}&token=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
  const rows = (await res.json()) as Array<{
    headline?: string;
    summary?: string;
    source?: string;
    url?: string;
    datetime?: number;
  }>;
  const fetchedAt = nowIso();
  if (!Array.isArray(rows)) return { items: [] };
  return {
    items: rows.slice(0, 15).map((r) => {
      const publishedAt = r.datetime ? new Date(r.datetime * 1000).toISOString() : fetchedAt;
      return {
        id: hash((r.headline ?? "") + (r.url ?? "")),
        kind: "news" as const,
        title: r.headline ?? "Untitled",
        summary: r.summary ?? "",
        source: `Finnhub / ${r.source ?? "unknown"}`,
        url: r.url,
        publishedAt,
        fetchedAt,
        freshnessMinutes: minutesSince(publishedAt),
        relevance: 0.7,
        reliability: 0.8,
        relationToThesis: "Vendor company-news feed. Corroborate before acting.",
      };
    }),
  };
}

async function newsApi(query: string): Promise<{ items: ResearchItem[] }> {
  const key = process.env.NEWSAPI_KEY;
  if (!key) return { items: [] };
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=15`;
  const res = await fetch(url, { headers: { "X-Api-Key": key } });
  if (!res.ok) throw new Error(`NewsAPI HTTP ${res.status}`);
  const json = (await res.json()) as {
    articles?: Array<{ title?: string; description?: string; url?: string; publishedAt?: string; source?: { name?: string } }>;
  };
  const fetchedAt = nowIso();
  return {
    items: (json.articles ?? []).map((a) => {
      const publishedAt = a.publishedAt ?? fetchedAt;
      return {
        id: hash((a.title ?? "") + (a.url ?? "")),
        kind: "news" as const,
        title: a.title ?? "Untitled",
        summary: a.description ?? "",
        source: `NewsAPI / ${a.source?.name ?? "unknown"}`,
        url: a.url,
        publishedAt,
        fetchedAt,
        freshnessMinutes: minutesSince(publishedAt),
        relevance: 0.65,
        reliability: 0.75,
        relationToThesis: "General news search. Relevance scored later against the ticker.",
      };
    }),
  };
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${name}>`, "i"))
    || xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m?.[1]?.trim() ?? "";
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function strip(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
