import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { signRequest } from "./client";

describe("signRequest", () => {
  it("matches a frozen known-answer vector (locks prehash = ts+method+path+body)", () => {
    // Frozen vector: base64(HMAC-SHA256("testsecret",
    //   "1700000000000" + "GET" + "/api/v3/market/tickers?symbol=BTCUSDT" + "")).
    // Computed out-of-band. If someone reorders the prehash concatenation, this
    // breaks — which is the whole point: a wrong order silently fails EVERY
    // authenticated Bitget call at runtime, so we pin it here.
    const sig = signRequest({
      apiSecret: "testsecret",
      timestamp: "1700000000000",
      method: "GET",
      path: "/api/v3/market/tickers?symbol=BTCUSDT",
      body: "",
    });
    expect(sig).toBe("RwMWvwNB33S81k7+cp0K5zak5xwTS0UY5l3bBU1kRG8=");
  });

  it("signs POST bodies and is order-sensitive", () => {
    const args = {
      apiSecret: "s3cr3t",
      timestamp: "1699999999999",
      method: "POST" as const,
      path: "/api/v3/trade/place-order",
      body: JSON.stringify({ symbol: "AAPLUSDT", side: "buy" }),
    };
    const sig = signRequest(args);
    // Independent recomputation of the documented formula.
    const expected = createHmac("sha256", args.apiSecret)
      .update(args.timestamp + args.method + args.path + args.body)
      .digest("base64");
    expect(sig).toBe(expected);
    // A different prehash ORDER (method+timestamp+...) must produce a different
    // signature, proving the implementation does not silently permute fields.
    const wrongOrder = createHmac("sha256", args.apiSecret)
      .update(args.method + args.timestamp + args.path + args.body)
      .digest("base64");
    expect(sig).not.toBe(wrongOrder);
  });

  it("treats an omitted body as an empty string", () => {
    const withEmpty = signRequest({ apiSecret: "k", timestamp: "1", method: "GET", path: "/x", body: "" });
    const withOmitted = signRequest({ apiSecret: "k", timestamp: "1", method: "GET", path: "/x" });
    expect(withOmitted).toBe(withEmpty);
  });
});
