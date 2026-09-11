import type { PaymentRequirements } from "@x402/core/types";
import type { DiscoveryResource, SearchDiscoveryResourcesResponse } from "@x402/extensions/bazaar";
import { describe, expect, it, vi } from "vitest";
import {
  discoverPayAndFetch,
  NoAcceptablePaymentOptionError,
  NoDiscoverableResourceError,
  PaymentFailedError,
  type PaymentPayer,
  payAndFetch,
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

function fakePayer(overrides: Partial<PaymentPayer> = {}): PaymentPayer {
  return {
    network: NETWORK,
    createPaymentPayload: vi.fn(async (x402Version, requirements) => ({
      x402Version,
      payload: { signed: true, for: requirements.payTo },
    })),
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
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { accepts: [req] },
          { status: 402, headers: { "payment-required": b64({ accepts: [req] }) } }
        )
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
    expect((retryInit.headers as Record<string, string>)["PAYMENT-SIGNATURE"]).toBeDefined();
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
