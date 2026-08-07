import { describe, expect, it } from "vitest";
import { createFacilitatorApp } from "./app.js";
import type { FacilitatorCore } from "./core.js";

/**
 * Tests the Hono HTTP layer in isolation, against a fake `FacilitatorCore`
 * (via `app.request()` — Hono's in-memory request simulation, no real
 * network or port). `core.test.ts` covers the real thing against live
 * testnet; this file covers "does the HTTP wiring do what it should
 * regardless of what the core returns."
 */

/** Every JSON body this test suite reads back, loosely — just enough shape for the assertions below. */
interface TestResponseBody {
  status?: string;
  service?: string;
  endpoints?: Record<string, string>;
  kinds?: Array<{ network?: string; extra?: { areFeesSponsored?: boolean } }>;
  isValid?: boolean;
  invalidReason?: string;
  payer?: string;
  success?: boolean;
  transaction?: string;
  errorReason?: string;
}

/** `Response.json()` types as `unknown`; every response body here is our own JSON, read back for assertions. */
async function readJson(res: Response): Promise<TestResponseBody> {
  return res.json() as Promise<TestResponseBody>;
}

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

const validRequestBody = {
  x402Version: 2,
  paymentPayload: {
    x402Version: 2,
    accepted: {
      scheme: "exact",
      network: "stellar:testnet",
      asset: "CASSET",
      amount: "1",
      payTo: "GPAYTO",
      maxTimeoutSeconds: 60,
      extra: {},
    },
    payload: { transaction: "base64tx" },
  },
  paymentRequirements: {
    scheme: "exact",
    network: "stellar:testnet",
    asset: "CASSET",
    amount: "1",
    payTo: "GPAYTO",
    maxTimeoutSeconds: 60,
    extra: {},
  },
};

describe("GET /", () => {
  it("explains the service instead of 404ing with no context", async () => {
    const app = createFacilitatorApp(fakeCore());
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.service).toBe("periplo-facilitator");
    expect(body.endpoints).toMatchObject({ health: "/health", supported: "/supported" });
  });
});

describe("GET /health", () => {
  it("returns ok", async () => {
    const app = createFacilitatorApp(fakeCore());
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ status: "ok" });
  });
});

describe("GET /supported", () => {
  it("returns whatever the core reports, verbatim", async () => {
    const app = createFacilitatorApp(fakeCore());
    const res = await app.request("/supported");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.kinds?.[0]?.network).toBe("stellar:testnet");
    expect(body.kinds?.[0]?.extra?.areFeesSponsored).toBe(true);
  });
});

describe("POST /verify", () => {
  it("passes a well-shaped request through to the core and returns its result", async () => {
    const app = createFacilitatorApp(fakeCore());
    const res = await app.request("/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequestBody),
    });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ isValid: true, payer: "GPAYER" });
  });

  it("rejects non-JSON bodies with a non-null reason, not a crash", async () => {
    const app = createFacilitatorApp(fakeCore());
    const res = await app.request("/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.isValid).toBe(false);
    expect(body.invalidReason).toBeTruthy();
  });

  it("rejects a request missing paymentRequirements with a non-null reason", async () => {
    const app = createFacilitatorApp(fakeCore());
    const res = await app.request("/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x402Version: 2, paymentPayload: validRequestBody.paymentPayload }),
    });
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.isValid).toBe(false);
    expect(body.invalidReason).toBe("invalid_request_shape");
  });

  it("never calls the core for a malformed request (fails fast at the boundary)", async () => {
    let called = false;
    const app = createFacilitatorApp(
      fakeCore({
        verify: async () => {
          called = true;
          return { isValid: true };
        },
      })
    );
    await app.request("/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(called).toBe(false);
  });
});

describe("POST /settle", () => {
  it("passes a well-shaped request through to the core and returns its result", async () => {
    const app = createFacilitatorApp(fakeCore());
    const res = await app.request("/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequestBody),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.transaction).toBe("abc123");
  });

  it("rejects a malformed request with transaction: '' and a non-null reason, matching the reference facilitator's observed shape", async () => {
    const app = createFacilitatorApp(fakeCore());
    const res = await app.request("/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.transaction).toBe("");
    expect(body.errorReason).toBeTruthy();
  });

  it("surfaces the core's failure response (success: false) verbatim rather than throwing", async () => {
    const app = createFacilitatorApp(
      fakeCore({
        settle: async () => ({
          success: false,
          transaction: "",
          network: "stellar:testnet",
          errorReason: "invalid_exact_stellar_payload_malformed",
        }),
      })
    );
    const res = await app.request("/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequestBody),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.errorReason).toBe("invalid_exact_stellar_payload_malformed");
  });
});
