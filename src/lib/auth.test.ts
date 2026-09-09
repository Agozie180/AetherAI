import { describe, expect, it, afterEach } from "vitest";
import { requireAdmin } from "./auth";

const saved = process.env.AETHER_ADMIN_TOKEN;

afterEach(() => {
  process.env.AETHER_ADMIN_TOKEN = saved;
});

describe("admin authorization", () => {
  it("fails closed when no admin token is configured", async () => {
    delete process.env.AETHER_ADMIN_TOKEN;
    const response = requireAdmin(new Request("http://localhost"));
    expect(response?.status).toBe(503);
  });

  it("rejects invalid bearer tokens", () => {
    process.env.AETHER_ADMIN_TOKEN = "expected";
    const response = requireAdmin(new Request("http://localhost", { headers: { authorization: "Bearer wrong" } }));
    expect(response?.status).toBe(401);
  });

  it("accepts the configured bearer token", () => {
    process.env.AETHER_ADMIN_TOKEN = "expected";
    expect(requireAdmin(new Request("http://localhost", { headers: { authorization: "Bearer expected" } }))).toBeNull();
  });
});
