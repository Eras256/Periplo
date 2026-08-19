import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentPayload } from "@x402/core/types";
import { describe, expect, it } from "vitest";
import { createFacilitatorApp } from "./app.js";
import type { FacilitatorCore } from "./core.js";

/**
 * Tests the HTTP wiring in isolation (`app.request()`, no real network or
 * Stellar transaction, same pattern as `app.test.ts`): does the demo
 * resource actually challenge for payment, and does a verified/settled
 * payment actually reach the real conversion handler and get a real,
 * independently-checkable result back. `scripts/demo-resource-settle.ts`
 * (not part of `pnpm test`, same convention as `scripts/settle-demo.ts`)
 * is the real end-to-end evidence: a real signed testnet payment, cataloged
 * for real against the live Supabase project.
 */

const DEMO_CONFIG = {
  payTo: "GDEMOPAYEE",
  assetAddress: "CDEMOASSET",
  network: "stellar:testnet" as const,
  baseUrl: "https://demo-resource-test.example",
};

function fakeCore(overrides: Partial<FacilitatorCore> = {}): FacilitatorCore {
  return {
    getSupported: () => ({
      kinds: [
        {
          x402Version: 2,
          scheme: "exact",
          network: "stellar:testnet",
          extra: { areFeesSponsored: true },
        },
      ],
      extensions: [],
      signers: { "stellar:*": ["GFAKE"] },
    }),
    verify: async () => ({ isValid: true, payer: "GPAYER" }),
    settle: async () => ({ success: true, transaction: "abc123", network: "stellar:testnet" }),
    ...overrides,
  };
}

interface TemperatureResponseBody {
  value?: number;
  from?: string;
  to?: string;
  result?: number;
  error?: string;
}

async function readJson<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

/**
 * x402 v2 puts the `PaymentRequired` payload in the `payment-required`
 * response header, base64-encoded, not the response body (the body
 * defaults to `{}` for non-browser clients unless a route overrides it,
 * confirmed empirically, not assumed from the SDK's own doc comments).
 */
function readPaymentRequired(res: Response) {
  const header = res.headers.get("payment-required");
  if (!header) throw new Error("expected a payment-required header on a 402 response");
  return decodePaymentRequiredHeader(header);
}

describe("GET /demo/temperature-convert: unpaid request", () => {
  it("challenges with 402 and the route's own payTo/asset/network", async () => {
    const app = createFacilitatorApp(fakeCore(), { demoResource: DEMO_CONFIG });
    const res = await app.request("/demo/temperature-convert?value=100&from=celsius&to=fahrenheit");

    expect(res.status).toBe(402);
    const paymentRequired = readPaymentRequired(res);
    expect(paymentRequired.accepts[0]?.payTo).toBe(DEMO_CONFIG.payTo);
    expect(paymentRequired.accepts[0]?.asset).toBe(DEMO_CONFIG.assetAddress);
    expect(paymentRequired.accepts[0]?.network).toBe(DEMO_CONFIG.network);
  });

  it("declares the bazaar discovery extension in the 402 response", async () => {
    const app = createFacilitatorApp(fakeCore(), { demoResource: DEMO_CONFIG });
    const res = await app.request("/demo/temperature-convert?value=100&from=celsius&to=fahrenheit");
    const paymentRequired = readPaymentRequired(res);
    expect(paymentRequired.extensions?.bazaar).toBeTruthy();
  });

  it("uses the configured baseUrl for resource.url, not whatever the request adapter would derive", async () => {
    // Regression coverage for a real bug found deploying this to Fly:
    // @hono/node-server derives a request's scheme purely from
    // `socket.encrypted`, which is always false behind Fly's
    // TLS-terminating proxy, so an SDK-derived resource.url would come
    // out as http://... in production. RouteConfig.resource (set from
    // config.baseUrl) bypasses that entirely.
    const app = createFacilitatorApp(fakeCore(), { demoResource: DEMO_CONFIG });
    const res = await app.request("/demo/temperature-convert?value=100&from=celsius&to=fahrenheit");
    const paymentRequired = readPaymentRequired(res);
    expect(paymentRequired.resource.url).toBe(`${DEMO_CONFIG.baseUrl}/demo/temperature-convert`);
  });
});

describe("GET /demo/temperature-convert: without demoResource configured", () => {
  it("404s instead of existing, matching the optional-mount contract", async () => {
    const app = createFacilitatorApp(fakeCore());
    const res = await app.request("/demo/temperature-convert?value=100&from=celsius&to=fahrenheit");
    expect(res.status).toBe(404);
  });
});

describe("GET /demo/temperature-convert: verified and settled payment", () => {
  async function paidRequest(query: string): Promise<Response> {
    const app = createFacilitatorApp(fakeCore(), { demoResource: DEMO_CONFIG });
    const paymentPayload: PaymentPayload = {
      x402Version: 2,
      accepted: {
        scheme: "exact",
        network: DEMO_CONFIG.network,
        asset: DEMO_CONFIG.assetAddress,
        amount: "1000",
        payTo: DEMO_CONFIG.payTo,
        maxTimeoutSeconds: 300,
        extra: { areFeesSponsored: true },
      },
      payload: { transaction: "base64tx" },
    };
    // x402 v2 carries the payment payload in the PAYMENT-SIGNATURE header,
    // not X-PAYMENT (that's v1); confirmed empirically against the real
    // upstream client (typescript/packages/core/src/http/x402HTTPClient.ts's
    // own version switch), not assumed from the header's name alone.
    return app.request(`/demo/temperature-convert?${query}`, {
      headers: { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(paymentPayload) },
    });
  }

  it("returns the real converted value, not a canned response, for a verified payment", async () => {
    const res = await paidRequest("value=100&from=celsius&to=fahrenheit");
    expect(res.status).toBe(200);
    const body = await readJson<TemperatureResponseBody>(res);
    expect(body).toEqual({ value: 100, from: "celsius", to: "fahrenheit", result: 212 });
  });

  it("computes a different real result for a different query (proves it isn't a static echo)", async () => {
    const res = await paidRequest("value=0&from=celsius&to=kelvin");
    const body = await readJson<TemperatureResponseBody>(res);
    expect(body.result).toBe(273.15);
  });

  it("rejects a malformed query with 400 even though payment already verified", async () => {
    const res = await paidRequest("value=not-a-number&from=celsius&to=fahrenheit");
    expect(res.status).toBe(400);
  });
});
