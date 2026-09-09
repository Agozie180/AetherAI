export function requireAdmin(request: Request): Response | null {
  const expected = process.env.AETHER_ADMIN_TOKEN;
  if (!expected) return new Response(JSON.stringify({ ok: false, error: "AETHER_ADMIN_TOKEN is required for mutating operations" }), { status: 503, headers: { "content-type": "application/json" } });
  if (request.headers.get("authorization") !== `Bearer ${expected}`) return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  return null;
}
