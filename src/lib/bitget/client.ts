import { createHmac } from "node:crypto";

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

async function request<T>(
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
    const signPath = pathAndQuery;
    const prehash = timestamp + method + signPath + bodyStr;
    const sign = createHmac("sha256", cfg.apiSecret).update(prehash).digest("base64");
    headers["ACCESS-KEY"] = cfg.apiKey;
    headers["ACCESS-SIGN"] = sign;
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
    const json = JSON.parse(text) as { code?: string; msg?: string; data?: T };
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
