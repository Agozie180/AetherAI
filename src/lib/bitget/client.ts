import { createHmac } from "node:crypto";
import { sleep } from "../util";

/**
 * Official Bitget UTA v3 + documented Demo header.
 * Do not add endpoints that are not in Bitget docs.
 */
export const BITGET_REST = "https://api.bitget.com";

export type BitgetMode = "public" | "demo" | "live";

export class BitgetError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
    readonly path: string,
  ) {
    super(message);
    this.name = "BitgetError";
  }
}

export interface BitgetConfig {
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string;
  paper?: boolean;
  timeoutMs?: number;
}

export function bitgetConfigFromEnv(): BitgetConfig {
  return {
    apiKey: process.env.BITGET_API_KEY || undefined,
    apiSecret: process.env.BITGET_API_SECRET || undefined,
    passphrase: process.env.BITGET_API_PASSPHRASE || undefined,
    paper: process.env.BITGET_PAPER !== "0",
    timeoutMs: 20_000,
  };
}

export function bitgetMode(cfg: BitgetConfig): BitgetMode {
  if (!cfg.apiKey || !cfg.apiSecret || !cfg.passphrase) return "public";
  if (cfg.paper) return "demo";
  return "live";
}

export async function bitgetGet<T>(
  path: string,
  query: Record<string, string | number | undefined> = {},
  cfg: BitgetConfig = bitgetConfigFromEnv(),
): Promise<T> {
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  const urlPath = qs ? `${path}?${qs}` : path;
  return request<T>("GET", urlPath, undefined, cfg);
}

export async function bitgetPost<T>(
  path: string,
  body: unknown,
  cfg: BitgetConfig = bitgetConfigFromEnv(),
): Promise<T> {
  return request<T>("POST", path, body, cfg);
}

/**
 * Deterministic UTA v3 signature: base64(HMAC-SHA256(secret, ts+method+path+body)).
 * The prehash order (timestamp + method + signPath + body) is exactly what
 * Bitget verifies — reordering it silently breaks every authenticated call, so
 * it is extracted here to be unit-locked. `path` must already include the query
 * string for GETs (the signed path and the requested path are identical).
 */
export function signRequest(args: {
  apiSecret: string;
  timestamp: string;
  method: "GET" | "POST";
  path: string;
  body?: string;
}): string {
  const prehash = args.timestamp + args.method + args.path + (args.body ?? "");
  return createHmac("sha256", args.apiSecret).update(prehash).digest("base64");
}

/** HTTP statuses worth a retry: gateway/transient server + rate limit. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function isTransient(err: unknown): boolean {
  if (err instanceof BitgetError) return RETRYABLE_STATUS.has(err.status);
  // fetch network failures and AbortError timeouts are not BitgetError — treat
  // them as transient (only GETs are ever retried, so this cannot double-fill).
  return true;
}

async function request<T>(
  method: "GET" | "POST",
  pathAndQuery: string,
  body: unknown,
  cfg: BitgetConfig,
): Promise<T> {
  // Only idempotent reads are retried. Order placement (POST) is NEVER
  // auto-resent — even though clientOid would dedupe server-side, we refuse to
  // gamble on a double-submit and let write callers handle failures explicitly.
  const maxAttempts = method === "GET" ? 3 : 1;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await requestOnce<T>(method, pathAndQuery, body, cfg);
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isTransient(err)) throw err;
      // Exponential backoff with light jitter: ~200ms, ~400ms.
      await sleep(Math.round(200 * 2 ** (attempt - 1) * (1 + Math.random() * 0.25)));
    }
  }
  throw lastErr;
}

async function requestOnce<T>(
  method: "GET" | "POST",
  pathAndQuery: string,
  body: unknown,
  cfg: BitgetConfig,
): Promise<T> {
  const timestamp = Date.now().toString();
  const bodyStr = body === undefined ? "" : JSON.stringify(body);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    locale: "en-US",
  };

  if (cfg.apiKey && cfg.apiSecret && cfg.passphrase) {
    headers["ACCESS-KEY"] = cfg.apiKey;
    headers["ACCESS-SIGN"] = signRequest({
      apiSecret: cfg.apiSecret,
      timestamp,
      method,
      path: pathAndQuery,
      body: bodyStr,
    });
    headers["ACCESS-TIMESTAMP"] = timestamp;
    headers["ACCESS-PASSPHRASE"] = cfg.passphrase;
    if (cfg.paper) headers.paptrading = "1";
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 20_000);
  try {
    const res = await fetch(`${BITGET_REST}${pathAndQuery}`, {
      method,
      headers,
      body: method === "POST" ? bodyStr : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new BitgetError(
        `Bitget HTTP ${res.status} ${method} ${pathAndQuery}`,
        res.status,
        text.slice(0, 2000),
        pathAndQuery,
      );
    }
    let json: { code?: string; msg?: string; data?: T };
    try {
      json = JSON.parse(text) as { code?: string; msg?: string; data?: T };
    } catch {
      // A 2xx carrying a non-JSON body (gateway/HTML error page, truncated
      // response) must not surface as an opaque SyntaxError from deep in the
      // stack. Fail loudly as a BitgetError with the raw text for diagnosis.
      throw new BitgetError(
        `Bitget returned a non-JSON body ${method} ${pathAndQuery}`,
        res.status,
        text.slice(0, 2000),
        pathAndQuery,
      );
    }
    if (json.code && json.code !== "00000") {
      throw new BitgetError(
        `Bitget ${json.code}: ${json.msg ?? "error"}`,
        res.status,
        text.slice(0, 2000),
        pathAndQuery,
      );
    }
    return (json.data as T) ?? (json as T);
  } finally {
    clearTimeout(t);
  }
}
