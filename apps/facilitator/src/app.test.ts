import type { Database } from "@periplo/bazaar";
import type { SupabaseClient } from "@supabase/supabase-js";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { describe, expect, it } from "vitest";
import { createFacilitatorApp } from "./app.js";
import type { FacilitatorCore } from "./core.js";

/**
 * Tests the Hono HTTP layer in isolation, against a fake `FacilitatorCore`
 * (via `app.request()`, Hono's in-memory request simulation, no real
 * network or port). `core.test.ts` covers the real thing against live
 * testnet; this file covers "does the HTTP wiring do what it should
 * regardless of what the core returns."
 */

/** Every JSON body this test suite reads back, loosely, just enough shape for the assertions below. */
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

interface DecodedExtensionResponses {
  bazaar?: { status?: string; rejectedReason?: string };
}

function readExtensionResponsesHeader(res: Response): DecodedExtensionResponses | null {
  const header = res.headers.get("EXTENSION-RESPONSES");
  if (!header) return null;
  return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as DecodedExtensionResponses;
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

/**
 * Fake `.from("resources").select()...` chain, just enough for
 * `GET /discovery/resources`'s route-level tests. `GET /discovery/search`
 * calls the real `embedQuery` before touching a client at all, so its
 * route-level coverage below stops at the pre-embedding short-circuits
 * (missing `query`, no `catalogClient`): full ranking/response-shape
 * behavior is `discovery-routes.test.ts`'s job, against an injected
 * embedding, so no test here loads the real `fastembed` model.
 */
function fakeCatalogClient(rows: unknown[] = [], total = rows.length): SupabaseClient<Database> {
  const builder: Record<string, unknown> = {};
  const chain =
    () =>
    (..._args: unknown[]) =>
      builder;
  builder.select = chain();
  builder.order = chain();
  builder.range = chain();
  builder.eq = chain();
  builder.contains = chain();
  // biome-ignore lint/suspicious/noThenProperty: intentional, mirrors the real postgrest-js query builder, which is itself thenable so `await query` works with no trailing terminal call.
  builder.then = (resolve: (v: { data: unknown; error: null; count: number }) => void) =>
    resolve({ data: rows, error: null, count: total });
  return { from: () => builder } as unknown as SupabaseClient<Database>;
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
  it("returns whatever the core reports, verbatim, plus the kinds/extra it exposed", async () => {
    const app = createFacilitatorApp(fakeCore());
    const res = await app.request("/supported");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.kinds?.[0]?.network).toBe("stellar:testnet");
    expect(body.kinds?.[0]?.extra?.areFeesSponsored).toBe(true);
  });

  it("always advertises the bazaar extension, even though core.getSupported() knows nothing about it", async () => {
    const app = createFacilitatorApp(fakeCore());
    const res = await app.request("/supported");
    const body = (await res.json()) as { extensions?: string[] };
    expect(body.extensions).toContain("bazaar");
  });

  it("does not list bazaar twice if the core itself somehow already reports it", async () => {
    const app = createFacilitatorApp(
      fakeCore({
        getSupported: () => ({
          kinds: [],
          extensions: ["bazaar"],
          signers: {},
        }),
      })
    );
    const res = await app.request("/supported");
    const body = (await res.json()) as { extensions?: string[] };
    expect(body.extensions).toEqual(["bazaar"]);
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

describe("bazaar discovery extension: EXTENSION-RESPONSES header (spec Phase 4)", () => {
  /** A well-formed HTTP GET discovery extension, as a resource server would declare it. */
  function validExtension(): Record<string, unknown> {
    const extension = declareDiscoveryExtension({
      input: { city: "San Francisco" },
      inputSchema: { properties: { city: { type: "string" } }, required: ["city"] },
      output: { example: { weather: "foggy" } },
    });
    const bazaarExt = extension["bazaar"] as unknown as Record<string, unknown>;
    const info = bazaarExt["info"] as Record<string, unknown>;
    (info["input"] as Record<string, unknown>)["method"] = "GET";
    return extension as unknown as Record<string, unknown>;
  }

  function requestBodyWithExtensions(extensions: Record<string, unknown>) {
    return {
      ...validRequestBody,
      paymentPayload: {
        ...validRequestBody.paymentPayload,
        resource: { url: "https://seller.example/weather" },
        extensions,
      },
    };
  }

  it("emits no EXTENSION-RESPONSES header when the payload declares no bazaar extension", async () => {
    const app = createFacilitatorApp(fakeCore());
    const res = await app.request("/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequestBody),
    });
    expect(res.headers.get("EXTENSION-RESPONSES")).toBeNull();
  });

  // Regression coverage for the settle-only cataloging decision
  // (docs/DEFERRED.md, prompted by x402-foundation/x402#3226): /verify
  // never runs bazaar processing, valid extension or not, because
  // `isValid: true` proves the payload could settle, not that it did.
  it("never processes the bazaar extension on /verify, regardless of the payload's validity", async () => {
    const app = createFacilitatorApp(fakeCore());
    const res = await app.request("/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBodyWithExtensions(validExtension())),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("EXTENSION-RESPONSES")).toBeNull();
  });

  it("rejects with a reason (not a 500) when the extension is declared but payload.resource.url is missing", async () => {
    const app = createFacilitatorApp(fakeCore());
    const body = {
      ...validRequestBody,
      paymentPayload: { ...validRequestBody.paymentPayload, extensions: validExtension() },
    };
    const res = await app.request("/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    const decoded = readExtensionResponsesHeader(res);
    expect(decoded?.bazaar?.status).toBe("rejected");
    expect(decoded?.bazaar?.rejectedReason).toMatch(/resource\.url/);
  });

  it("emits a success header on /settle for a valid declared extension, without a catalog client configured", async () => {
    const app = createFacilitatorApp(fakeCore());
    const res = await app.request("/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBodyWithExtensions(validExtension())),
    });
    expect(res.status).toBe(200);
    expect(readExtensionResponsesHeader(res)).toEqual({ bazaar: { status: "success" } });
  });

  // Regression coverage for a real, money-relevant bug (2026-08-26,
  // found live by a real seller): @x402/core@2.22.0's own
  // HTTPFacilitatorClient.settle() reads EXTENSION-RESPONSES only to
  // console.log it, then discards the response, so a seller calling
  // settle() through the official client never sees the header at all.
  // The body's own `extensions` field (already part of SettleResponse's
  // type, already parsed and returned by that same client) works today
  // with no upstream fix needed.
  it("also echoes the extension outcome in the response body's extensions field, not just the header", async () => {
    const app = createFacilitatorApp(fakeCore());
    const res = await app.request("/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBodyWithExtensions(validExtension())),
    });
    const body = (await res.json()) as { extensions?: unknown };
    expect(body.extensions).toEqual({ bazaar: { status: "success" } });
  });

  // Regression coverage for the transition window x402-foundation/x402#3306
  // (merged 2026-08-31) opened: SettleResponse now declares a distinct
  // `extensionResponses` field alongside `extensions`, not a replacement.
  // Sent here for any caller reading the body directly; the official
  // HTTPFacilitatorClient itself gets this field for free from the
  // EXTENSION-RESPONSES header instead (confirmed against the real merged
  // source, see the comment on the /settle handler), so this test only
  // covers Periplo's own body shape, not client-side parsing.
  it("also echoes the extension outcome in the response body's extensionResponses field, alongside extensions", async () => {
    const app = createFacilitatorApp(fakeCore());
    const res = await app.request("/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBodyWithExtensions(validExtension())),
    });
    const body = (await res.json()) as { extensions?: unknown; extensionResponses?: unknown };
    expect(body.extensionResponses).toEqual({ bazaar: { status: "success" } });
    expect(body.extensionResponses).toEqual(body.extensions);
  });

  it("emits a rejected header with a specific reason for a hostile routeTemplate", async () => {
    const extension = validExtension();
    (extension["bazaar"] as Record<string, unknown>)["routeTemplate"] = "/../../etc/passwd";

    const app = createFacilitatorApp(fakeCore());
    const res = await app.request("/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBodyWithExtensions(extension)),
    });
    expect(res.status).toBe(200);
    const decoded = readExtensionResponsesHeader(res);
    expect(decoded?.bazaar?.status).toBe("rejected");
    expect(decoded?.bazaar?.rejectedReason).toBeTruthy();
  });

  it("does not run bazaar processing when the underlying settle fails", async () => {
    const app = createFacilitatorApp(
      fakeCore({
        settle: async () => ({
          success: false,
          transaction: "",
          network: "stellar:testnet",
          errorReason: "settlement_failed",
        }),
      })
    );
    const res = await app.request("/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBodyWithExtensions(validExtension())),
    });
    expect(res.headers.get("EXTENSION-RESPONSES")).toBeNull();
  });
});

describe("GET /discovery/resources", () => {
  it("returns 503 with a reason when no catalogClient is configured", async () => {
    const app = createFacilitatorApp(fakeCore());
    const res = await app.request("/discovery/resources");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();
  });

  it("returns the wire shape from a configured catalogClient", async () => {
    const row = {
      url: "https://seller.example/weather",
      type: "http",
      accepts: [{ scheme: "exact", network: "stellar:testnet", asset: "CASSET", amount: "1000" }],
      extensions: [],
      last_updated: "2026-08-07T12:00:00.000Z",
      description: null,
    };
    const app = createFacilitatorApp(fakeCore(), { catalogClient: fakeCatalogClient([row], 1) });
    const res = await app.request("/discovery/resources");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { x402Version?: number; items?: unknown[] };
    expect(body.x402Version).toBe(2);
    expect(body.items).toHaveLength(1);
  });
});

describe("GET /discovery/search", () => {
  it("returns 503 with a reason when no catalogClient is configured", async () => {
    const app = createFacilitatorApp(fakeCore());
    const res = await app.request("/discovery/search?query=weather");
    expect(res.status).toBe(503);
  });

  it("returns 400 when query is missing, before touching the catalog", async () => {
    const app = createFacilitatorApp(fakeCore(), { catalogClient: fakeCatalogClient() });
    const res = await app.request("/discovery/search");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();
  });
});

interface StatusResponseBody {
  uptimeSeconds?: number;
  requestsServed?: number;
  errorRate?: number;
  latencyP50Ms?: number | null;
  latencyP95Ms?: number | null;
  catalogSize?: number | null;
  lastSettledTransaction?: Record<string, { network?: string; transaction?: string }>;
}

describe("GET /status", () => {
  it("counts prior requests (not itself, which is still in flight when its own snapshot is taken) and reports null catalogSize with no catalogClient configured", async () => {
    const app = createFacilitatorApp(fakeCore());
    await app.request("/health"); // one completed request before /status is ever hit
    const res = await app.request("/status");
    expect(res.status).toBe(200);
    const body = (await res.json()) as StatusResponseBody;
    expect(body.requestsServed).toBe(1);
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(body.errorRate).toBe(0);
    expect(body.catalogSize).toBeNull();
    expect(body.lastSettledTransaction).toEqual({});
  });

  it("reports a real catalogSize when a catalogClient is configured", async () => {
    const app = createFacilitatorApp(fakeCore(), {
      catalogClient: fakeCatalogClient([], 7),
    });
    const res = await app.request("/status");
    const body = (await res.json()) as StatusResponseBody;
    expect(body.catalogSize).toBe(7);
  });

  it("records the last settled transaction per network after a real /settle success", async () => {
    const app = createFacilitatorApp(
      fakeCore({
        settle: async () => ({
          success: true,
          transaction: "settledhash1",
          network: "stellar:testnet",
        }),
      })
    );
    await app.request("/settle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validRequestBody),
    });
    const res = await app.request("/status");
    const body = (await res.json()) as StatusResponseBody;
    expect(body.lastSettledTransaction?.["stellar:testnet"]).toMatchObject({
      network: "stellar:testnet",
      transaction: "settledhash1",
    });
  });

  it("does not record a settlement when /settle fails", async () => {
    const app = createFacilitatorApp(
      fakeCore({
        settle: async () => ({
          success: false,
          transaction: "",
          network: "stellar:testnet",
          errorReason: "some_failure",
        }),
      })
    );
    await app.request("/settle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validRequestBody),
    });
    const res = await app.request("/status");
    const body = (await res.json()) as StatusResponseBody;
    expect(body.lastSettledTransaction).toEqual({});
  });

  it("counts a 4xx/5xx response toward errorRate", async () => {
    const app = createFacilitatorApp(fakeCore());
    await app.request("/discovery/search"); // 503, no catalogClient configured
    const res = await app.request("/status");
    const body = (await res.json()) as StatusResponseBody;
    expect(body.errorRate).toBeGreaterThan(0);
  });
});
