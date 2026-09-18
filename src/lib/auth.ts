import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  // Constant-time comparison. timingSafeEqual throws on unequal lengths, so the
  // length check is unavoidable — but we still compare the bytes in constant
  // time for equal-length inputs so the static admin token can't be recovered
  // by timing the response. The length of a random token is not secret.
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function requireAdmin(request: Request): Response | null {
  const expected = process.env.AETHER_ADMIN_TOKEN;
  if (!expected) return new Response(JSON.stringify({ ok: false, error: "AETHER_ADMIN_TOKEN is required for mutating operations" }), { status: 503, headers: { "content-type": "application/json" } });
  const provided = request.headers.get("authorization") ?? "";
  if (!safeEqual(provided, `Bearer ${expected}`)) return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  return null;
}

/**
 * Non-throwing admin check for read endpoints that stay public but redact
 * sensitive fields (e.g. account equity) unless the caller is the operator.
 * Returns false when no token is configured, so a misconfigured deploy leaks
 * nothing rather than defaulting open.
 */
export function isAdmin(request: Request): boolean {
  const expected = process.env.AETHER_ADMIN_TOKEN;
  if (!expected) return false;
  const provided = request.headers.get("authorization") ?? "";
  return safeEqual(provided, `Bearer ${expected}`);
}
