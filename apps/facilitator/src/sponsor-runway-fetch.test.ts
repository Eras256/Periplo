import { describe, expect, it, vi } from "vitest";
import { fetchSponsorRunway, horizonUrlForNetwork } from "./sponsor-runway-fetch.js";

const SPONSOR = "GSPONSOR000000000000000000000000000000000000000000000";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("horizonUrlForNetwork", () => {
  it("resolves the real testnet and pubnet Horizon URLs", () => {
    expect(horizonUrlForNetwork("stellar:testnet")).toBe("https://horizon-testnet.stellar.org");
    expect(horizonUrlForNetwork("stellar:pubnet")).toBe("https://horizon.stellar.org");
  });

  it("throws on an unknown network rather than silently guessing a URL", () => {
    expect(() => horizonUrlForNetwork("stellar:mainnet")).toThrow(/unknown network/);
  });
});

describe("fetchSponsorRunway", () => {
  it("fetches the account and one page of transactions, then computes runway", async () => {
    const now = new Date("2026-09-10T12:00:00Z");
    vi.setSystemTime(now);

    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith(`/accounts/${SPONSOR}`)) {
        return jsonResponse({ balances: [{ asset_type: "native", balance: "500.0000000" }] });
      }
      if (url.includes("/transactions")) {
        return jsonResponse({
          _embedded: {
            records: [
              {
                source_account: SPONSOR,
                fee_charged: "60000",
                created_at: "2026-09-10T11:00:00Z",
              },
            ],
          },
          _links: { next: { href: "unused" } },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await fetchSponsorRunway(
      "stellar:testnet",
      SPONSOR,
      24,
      48,
      fetchImpl as unknown as typeof fetch
    );

    expect(result.balanceStroops).toBe(5_000_000_000);
    expect(result.feeChargedStroopsInWindow).toBe(60_000);
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining(`/accounts/${SPONSOR}`));

    vi.useRealTimers();
  });

  it("stops paginating once it crosses the lookback cutoff", async () => {
    const now = new Date("2026-09-10T12:00:00Z");
    vi.setSystemTime(now);

    let transactionCalls = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith(`/accounts/${SPONSOR}`)) {
        return jsonResponse({ balances: [{ asset_type: "native", balance: "10.0000000" }] });
      }
      transactionCalls++;
      // First (only, expected) page: one in-window record, then one
      // clearly outside the 1-hour lookback window.
      return jsonResponse({
        _embedded: {
          records: [
            { source_account: SPONSOR, fee_charged: "1000", created_at: "2026-09-10T11:59:00Z" },
            { source_account: SPONSOR, fee_charged: "999999", created_at: "2026-09-10T09:00:00Z" },
          ],
        },
        _links: { next: { href: "should-not-be-fetched" } },
      });
    });

    const result = await fetchSponsorRunway(
      "stellar:testnet",
      SPONSOR,
      1,
      48,
      fetchImpl as unknown as typeof fetch
    );

    expect(transactionCalls).toBe(1);
    expect(result.feeChargedStroopsInWindow).toBe(1000);

    vi.useRealTimers();
  });

  it("throws when Horizon returns a non-ok response for the account", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/transactions")) {
        return jsonResponse({ _embedded: { records: [] }, _links: { next: { href: "" } } });
      }
      return jsonResponse({}, false, 404);
    });

    await expect(
      fetchSponsorRunway("stellar:testnet", SPONSOR, 24, 48, fetchImpl as unknown as typeof fetch)
    ).rejects.toThrow(/Horizon returned 404/);
  });
});
