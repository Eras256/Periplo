import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import type { DiscoveryResource, SearchDiscoveryResourcesResponse } from "@x402/extensions/bazaar";
import { describe, expect, it, vi } from "vitest";
import {
  discoverPayAndFetch,
  NoAcceptablePaymentOptionError,
  NoDiscoverableResourceError,
  PaymentFailedError,
  type PaymentPayer,
  payAndFetch,
  resolveResourceRequestUrl,
  searchBazaar,
  selectExactStellarRequirement,
  selectPayableResource,
  UnexpectedResponseError,
} from "./buyer-client.js";

const NETWORK = "stellar:testnet";

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf-8").toString("base64");
}

function requirement(overrides: Partial<PaymentRequirements> = {}): PaymentRequirements {
  return {
    scheme: "exact",
    network: NETWORK,
    asset: "CTEST",
    amount: "1000",
    payTo: "GSELLER",
    maxTimeoutSeconds: 300,
    extra: { areFeesSponsored: true },
    ...overrides,
  };
}

/**
 * Mirrors what a real `x402Client.createPaymentPayload` does: picks the
 * matching `exact`/`network` entry out of the full `PaymentRequired` and
 * returns a complete payload, `resource` included, so tests exercise the
 * same contract `stellar-payer.ts`'s real implementation fulfills.
 */
function fakePayer(overrides: Partial<PaymentPayer> = {}): PaymentPayer {
  return {
    network: NETWORK,
    createPaymentPayload: vi.fn(async (paymentRequired: PaymentRequired) => {
      const requirements = selectExactStellarRequirement(paymentRequired.accepts, NETWORK);
      if (!requirements) {
        throw new Error("fakePayer: no matching requirement (test setup bug)");
      }
      return {
        x402Version: paymentRequired.x402Version,
        resource: paymentRequired.resource,
        accepted: requirements,
        payload: { signed: true, for: requirements.payTo },
      };
    }),
    ...overrides,
  };
}

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
) {
  const headers = new Headers(init.headers ?? {});
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers,
    json: async () => body,
  } as Response;
}

describe("selectExactStellarRequirement", () => {
  it("picks the exact/network match and ignores others", () => {
    const accepts = [
      requirement({ scheme: "upto", network: NETWORK }),
      requirement({ scheme: "exact", network: "stellar:pubnet" }),
      requirement({ scheme: "exact", network: NETWORK, payTo: "GRIGHT" }),
    ];
    expect(selectExactStellarRequirement(accepts, NETWORK)?.payTo).toBe("GRIGHT");
  });

  it("returns undefined when nothing matches", () => {
    expect(
      selectExactStellarRequirement([requirement({ network: "stellar:pubnet" })], NETWORK)
    ).toBeUndefined();
  });
});

describe("payAndFetch", () => {
  it("pays the 402 challenge and returns the settled result", async () => {
    const req = requirement();
    const challenge: PaymentRequired = {
      x402Version: 2,
      resource: { url: "https://seller.example/resource" },
      accepts: [req],
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(challenge, { status: 402, headers: { "payment-required": b64(challenge) } })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { result: 42 },
          { status: 200, headers: { "payment-response": b64({ transaction: "abc123" }) } }
        )
      );

    const result = await payAndFetch("https://seller.example/resource", fakePayer(), { fetchImpl });

    expect(result.paid).toBe(true);
    expect(result.body).toEqual({ result: 42 });
    expect(result.settlement).toEqual({ transaction: "abc123" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [, retryInit] = fetchImpl.mock.calls[1] as [string, RequestInit];
    const signatureHeader = (retryInit.headers as Record<string, string>)["PAYMENT-SIGNATURE"];
    expect(signatureHeader).toBeDefined();
    if (!signatureHeader) throw new Error("unreachable, asserted above");
    // Regression coverage for a real bug found live, 2026-09-10, running
    // this library against a resource server that catalogs via the
    // bazaar extension: an earlier version of PaymentPayer called the
    // scheme's own lower-level createPaymentPayload directly and never
    // set `resource` on the outgoing payload, so the resource server's
    // own cataloging step (which requires paymentPayload.resource.url)
    // silently never cataloged anything paid through this library.
    const sentPayload = JSON.parse(Buffer.from(signatureHeader, "base64").toString("utf-8"));
    expect(sentPayload.resource).toEqual({ url: "https://seller.example/resource" });
  });

  it("returns immediately, unpaid, when the resource isn't gated", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ free: true }, { status: 200 }));
    const result = await payAndFetch("https://seller.example/free", fakePayer(), { fetchImpl });
    expect(result).toEqual({ status: 200, body: { free: true }, paid: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws NoAcceptablePaymentOptionError when no exact/network option is offered", async () => {
    const offered = requirement({ network: "eip155:8453" });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {},
          { status: 402, headers: { "payment-required": b64({ accepts: [offered] }) } }
        )
      );
    await expect(
      payAndFetch("https://seller.example/resource", fakePayer(), { fetchImpl })
    ).rejects.toThrow(NoAcceptablePaymentOptionError);
  });

  it("throws PaymentFailedError, without retrying, on a definitive 4xx rejection", async () => {
    const req = requirement();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({}, { status: 402, headers: { "payment-required": b64({ accepts: [req] }) } })
      )
      .mockResolvedValueOnce(jsonResponse({ error: "insufficient_funds" }, { status: 402 }));

    await expect(
      payAndFetch("https://seller.example/resource", fakePayer(), { fetchImpl, maxAttempts: 3 })
    ).rejects.toThrow(PaymentFailedError);
    // 402 on the paid retry is a definitive rejection, not a transient 5xx:
    // only the first cycle's 2 calls should have happened, no retry cycle.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries the whole cycle on a transient 5xx, then succeeds", async () => {
    const req = requirement();
    const challenge = jsonResponse(
      {},
      { status: 402, headers: { "payment-required": b64({ accepts: [req] }) } }
    );
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(challenge)
      .mockResolvedValueOnce(jsonResponse({ error: "facilitator_unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(challenge)
      .mockResolvedValueOnce(jsonResponse({ ok: true }, { status: 200 }));

    const result = await payAndFetch("https://seller.example/resource", fakePayer(), {
      fetchImpl,
      maxAttempts: 2,
    });
    expect(result.paid).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("throws UnexpectedResponseError for a non-2xx/402 first response", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}, { status: 500 }));
    await expect(
      payAndFetch("https://seller.example/resource", fakePayer(), { fetchImpl })
    ).rejects.toThrow(UnexpectedResponseError);
  });
});

describe("searchBazaar", () => {
  it("builds the query string and returns the parsed response", async () => {
    const response: SearchDiscoveryResourcesResponse = { x402Version: 2, resources: [] };
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(response));

    await searchBazaar("https://facilitator.example/", { query: "weather forecast" }, fetchImpl);

    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toBe("https://facilitator.example/discovery/search?query=weather+forecast");
  });

  it("throws UnexpectedResponseError on a non-ok response", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}, { status: 500 }));
    await expect(
      searchBazaar("https://facilitator.example", { query: "x" }, fetchImpl)
    ).rejects.toThrow(UnexpectedResponseError);
  });
});

function discoveryResource(overrides: Partial<DiscoveryResource> = {}): DiscoveryResource {
  return {
    resource: "https://seller.example/resource",
    type: "http",
    x402Version: 2,
    accepts: [requirement()],
    lastUpdated: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

describe("selectPayableResource", () => {
  it("picks the first result with a matching exact option", () => {
    const results: SearchDiscoveryResourcesResponse = {
      x402Version: 2,
      resources: [
        discoveryResource({ accepts: [requirement({ network: "eip155:8453" })] }),
        discoveryResource({ resource: "https://seller.example/second" }),
      ],
    };
    expect(selectPayableResource(results, NETWORK)?.resource).toBe("https://seller.example/second");
  });
});

describe("resolveResourceRequestUrl", () => {
  it("appends the resource's own declared query-param example", () => {
    const resource = discoveryResource({
      extensions: {
        bazaar: { info: { input: { type: "http", queryParams: { value: 100, from: "celsius" } } } },
      },
    });
    const url = resolveResourceRequestUrl(resource);
    expect(url).toBe("https://seller.example/resource?value=100&from=celsius");
  });

  it("falls back to the bare canonical URL when no bazaar extension is declared", () => {
    expect(resolveResourceRequestUrl(discoveryResource())).toBe("https://seller.example/resource");
  });

  it("falls back to the bare canonical URL for a non-http (e.g. mcp) resource", () => {
    const resource = discoveryResource({
      extensions: { bazaar: { info: { input: { type: "mcp", toolName: "convert" } } } },
    });
    expect(resolveResourceRequestUrl(resource)).toBe("https://seller.example/resource");
  });

  it("falls back to the bare canonical URL when queryParams is empty", () => {
    const resource = discoveryResource({
      extensions: { bazaar: { info: { input: { type: "http", queryParams: {} } } } },
    });
    expect(resolveResourceRequestUrl(resource)).toBe("https://seller.example/resource");
  });
});

describe("discoverPayAndFetch", () => {
  it("searches, picks a payable resource, pays, and returns it alongside the result", async () => {
    const req = requirement();
    const resource = discoveryResource({ accepts: [req] });
    const searchResponse: SearchDiscoveryResourcesResponse = {
      x402Version: 2,
      resources: [resource],
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(searchResponse))
      .mockResolvedValueOnce(
        jsonResponse({}, { status: 402, headers: { "payment-required": b64({ accepts: [req] }) } })
      )
      .mockResolvedValueOnce(jsonResponse({ result: 1 }, { status: 200 }));

    const result = await discoverPayAndFetch(
      "https://facilitator.example",
      "convert temperature",
      fakePayer(),
      { fetchImpl }
    );

    expect(result.resource).toBe(resource);
    expect(result.paid).toBe(true);
    expect(result.body).toEqual({ result: 1 });
  });

  it("fetches the resource's own declared query-param example, not the bare canonical URL", async () => {
    // Regression coverage for a real bug found live, 2026-09-10: the
    // catalog's resource.resource field is a canonical URL
    // (@x402/extensions/bazaar's own extractDiscoveryInfo strips the
    // query string unconditionally, upstream's design, not something a
    // seller's own resource field can change), so a resource whose real
    // handler requires query parameters 400s if discoverPayAndFetch
    // naively pays the bare canonical URL. Fixed by reading the same
    // example a seller's own definePaidResource declares.
    const req = requirement();
    const resource = discoveryResource({
      accepts: [req],
      resource: "https://seller.example/convert",
      extensions: {
        bazaar: { info: { input: { type: "http", queryParams: { value: 100, from: "celsius" } } } },
      },
    });
    const searchResponse: SearchDiscoveryResourcesResponse = {
      x402Version: 2,
      resources: [resource],
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(searchResponse))
      .mockResolvedValueOnce(
        jsonResponse({}, { status: 402, headers: { "payment-required": b64({ accepts: [req] }) } })
      )
      .mockResolvedValueOnce(jsonResponse({ result: 1 }, { status: 200 }));

    await discoverPayAndFetch("https://facilitator.example", "convert", fakePayer(), { fetchImpl });

    const [challengeUrl] = fetchImpl.mock.calls[1] as [string];
    expect(challengeUrl).toBe("https://seller.example/convert?value=100&from=celsius");
  });

  it("throws NoDiscoverableResourceError when nothing found is payable", async () => {
    const searchResponse: SearchDiscoveryResourcesResponse = {
      x402Version: 2,
      resources: [discoveryResource({ accepts: [requirement({ network: "eip155:8453" })] })],
    };
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(searchResponse));

    await expect(
      discoverPayAndFetch("https://facilitator.example", "anything", fakePayer(), { fetchImpl })
    ).rejects.toThrow(NoDiscoverableResourceError);
  });
});
