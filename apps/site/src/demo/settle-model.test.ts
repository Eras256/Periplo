import { describe, expect, it } from "vitest";
import {
  computeCharge,
  MAX_CEILING,
  MAX_TOKENS,
  parseSettleRequest,
  parseSettleResponse,
} from "./settle-model";

const HASH = "a".repeat(64);
const settled = {
  status: "settled",
  hash: HASH,
  ledger: 4908741,
  network: "stellar:testnet",
  ceiling: "1000000",
  cost: "500000",
  capped: false,
  settled: { maxAmount: "1000000", actualAmount: "500000" },
  buyer: "GBUYER",
  seller: "GSELLER",
};

describe("parseSettleRequest", () => {
  it("accepts an integer ceiling (string or number) and an integer token count", () => {
    expect(parseSettleRequest({ ceiling: "1000000", tokens: 5000 })).toEqual({
      ok: true,
      value: { ceiling: 1_000_000n, tokens: 5000 },
    });
    expect(parseSettleRequest({ ceiling: 100, tokens: 0, network: "stellar:testnet" }).ok).toBe(
      true
    );
  });

  it("refuses every other network, explicitly", () => {
    for (const network of ["stellar:pubnet", "eip155:8453", "", null, 1]) {
      expect(parseSettleRequest({ ceiling: "1000000", tokens: 1, network })).toEqual({
        ok: false,
        error: "unsupported_network",
      });
    }
  });

  it("enforces the 0.10 USDC maximum and the one-token minimum on the server", () => {
    expect(parseSettleRequest({ ceiling: (MAX_CEILING + 1n).toString(), tokens: 1 })).toEqual({
      ok: false,
      error: "ceiling_out_of_range",
    });
    expect(parseSettleRequest({ ceiling: "99", tokens: 1 })).toEqual({
      ok: false,
      error: "ceiling_out_of_range",
    });
    expect(parseSettleRequest({ ceiling: MAX_CEILING.toString(), tokens: 1 }).ok).toBe(true);
  });

  it("rejects non-integer, negative, fractional and oversized inputs", () => {
    for (const ceiling of ["0.1", "-5", "1e6", "abc", "", 1.5, Number.NaN, null, {}]) {
      expect(parseSettleRequest({ ceiling, tokens: 1 }).ok).toBe(false);
    }
    for (const tokens of [-1, 1.5, "5", null, Number.NaN, MAX_TOKENS + 1, 2 ** 60]) {
      expect(parseSettleRequest({ ceiling: "1000000", tokens })).toEqual({
        ok: false,
        error: "invalid_tokens",
      });
    }
    for (const body of [null, "x", 5, [], undefined]) {
      expect(parseSettleRequest(body)).toEqual({ ok: false, error: "invalid_body" });
    }
  });

  it("ignores any amount the browser might add: only ceiling and tokens are read", () => {
    const parsed = parseSettleRequest({ ceiling: "1000000", tokens: 10, actual: "1", cost: "999" });
    expect(parsed).toEqual({ ok: true, value: { ceiling: 1_000_000n, tokens: 10 } });
  });
});

describe("computeCharge", () => {
  const ceiling = 1_000_000n;
  it("charges the real usage when it is below the ceiling", () => {
    expect(computeCharge({ ceiling, tokens: 5000 })).toEqual({
      cost: 500_000n,
      actual: 500_000n,
      capped: false,
    });
  });
  it("charges exactly the ceiling when usage equals it", () => {
    expect(computeCharge({ ceiling, tokens: 10_000 })).toEqual({
      cost: 1_000_000n,
      actual: 1_000_000n,
      capped: false,
    });
  });
  it("stops at the ceiling and says so when usage would cost more", () => {
    expect(computeCharge({ ceiling, tokens: 25_000 })).toEqual({
      cost: 2_500_000n,
      actual: 1_000_000n,
      capped: true,
    });
  });
  it("charges zero when nothing was used", () => {
    expect(computeCharge({ ceiling, tokens: 0 })).toEqual({ cost: 0n, actual: 0n, capped: false });
  });
});

describe("parseSettleResponse", () => {
  it("accepts a well-formed confirmed settlement", () => {
    expect(parseSettleResponse(settled)?.status).toBe("settled");
  });
  it("never yields a hash or amount from a malformed or unconfirmed answer", () => {
    for (const bad of [
      { ...settled, hash: "abc" },
      { ...settled, hash: HASH.toUpperCase() },
      { ...settled, network: "stellar:pubnet" },
      { ...settled, settled: { maxAmount: "1", actualAmount: "-1" } },
      { ...settled, settled: undefined },
      { ...settled, status: "pending" },
      { hash: HASH },
      null,
      "settled",
    ]) {
      expect(parseSettleResponse(bad)).toBeNull();
    }
  });
  it("passes an error code through without a hash", () => {
    expect(
      parseSettleResponse({ status: "error", code: "rate_limited_global", hash: HASH })
    ).toEqual({
      status: "error",
      code: "rate_limited_global",
    });
  });
});
