import { afterEach, describe, expect, it } from "vitest";
import { isAdmin, requireAdmin } from "./auth";

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://x.test/api/run", { headers });
}

describe("auth", () => {
  const original = process.env.AETHER_ADMIN_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.AETHER_ADMIN_TOKEN;
    else process.env.AETHER_ADMIN_TOKEN = original;
  });

  describe("isAdmin", () => {
    it("fails closed when no token is configured", () => {
      delete process.env.AETHER_ADMIN_TOKEN;
      expect(isAdmin(req({ authorization: "Bearer anything" }))).toBe(false);
    });

    it("is false for a missing or wrong bearer", () => {
      process.env.AETHER_ADMIN_TOKEN = "s3cret";
      expect(isAdmin(req())).toBe(false);
      expect(isAdmin(req({ authorization: "Bearer wrong" }))).toBe(false);
      // Right token but missing the "Bearer " prefix must still fail.
      expect(isAdmin(req({ authorization: "s3cret" }))).toBe(false);
    });

    it("is true only for the exact bearer token", () => {
      process.env.AETHER_ADMIN_TOKEN = "s3cret";
      expect(isAdmin(req({ authorization: "Bearer s3cret" }))).toBe(true);
    });
  });

  describe("requireAdmin", () => {
    it("503s when no token is configured", () => {
      delete process.env.AETHER_ADMIN_TOKEN;
      expect(requireAdmin(req({ authorization: "Bearer x" }))?.status).toBe(503);
    });

    it("401s on a bad token", () => {
      process.env.AETHER_ADMIN_TOKEN = "s3cret";
      expect(requireAdmin(req({ authorization: "Bearer nope" }))?.status).toBe(401);
    });

    it("authorizes (returns null) on the exact token", () => {
      process.env.AETHER_ADMIN_TOKEN = "s3cret";
      expect(requireAdmin(req({ authorization: "Bearer s3cret" }))).toBeNull();
    });
  });
});
