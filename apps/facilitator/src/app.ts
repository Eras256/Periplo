/**
 * The Hono HTTP layer: a thin wrapper around `FacilitatorCore`
 * (`core.ts`). This is deployment path 1/2 (hosted / self-hosted, spec §5
 * Phase 3); path 3 (self-facilitation inside a resource server) imports
 * `createFacilitatorCore` from `core.ts` directly and skips this file
 * entirely: no HTTP hop needed when the caller is in the same process.
 */

import { countCatalogResources, type Database } from "@periplo/bazaar";
import { embedQuery } from "@periplo/search";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { BAZAAR } from "@x402/extensions/bazaar";
import { type Context, Hono } from "hono";
import type { FacilitatorCore } from "./core.js";
import { type DemoResourceConfig, mountDemoResource } from "./demo-resource.js";
import { processBazaarExtension } from "./discovery.js";
import { listDiscoveryResources, searchDiscoveryResources } from "./discovery-routes.js";
import { type VerifyOrSettleRequestBody, verifyOrSettleRequestSchema } from "./schemas.js";
import { createTelemetryTracker } from "./telemetry.js";

/**
 * `zod` validates the wire shape at the boundary; the SDK's own types are
 * stricter about pass-through metadata we deliberately don't deep-validate
 * ourselves (e.g. `resource: ResourceInfo` vs. our schema's looser
 * `unknown`), `@x402/stellar` validates anything that actually matters
 * for settlement. This cast is the boundary between "shape zod confirmed"
 * and "type the SDK expects", not an escape from validation.
 */
function toSdkTypes(body: VerifyOrSettleRequestBody): {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
} {
  return {
    paymentPayload: body.paymentPayload as unknown as PaymentPayload,
    paymentRequirements: body.paymentRequirements as unknown as PaymentRequirements,
  };
}

/**
 * `EXTENSION-RESPONSES` header: base64-encoded JSON reporting the outcome
 * of any declared protocol extension (spec §4), so a seller can tell
 * whether a bazaar listing landed and why not. Matches `@x402/core`'s own
 * `safeBase64Encode` (`Buffer.from(data, "utf8").toString("base64")`) so
 * a stock `HTTPFacilitatorClient` decodes it without special-casing us.
 */
function encodeExtensionResponsesHeader(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export interface CreateFacilitatorAppOptions {
  /**
   * Service-role Supabase client for automatic cataloging (spec Phase 4).
   * `null`/omitted validates declared bazaar extensions and reports the
   * outcome via `EXTENSION-RESPONSES` without persisting anything: the
   * facilitator core has no hard dependency on a catalog database; only
   * this HTTP layer's cataloging step does.
   */
  readonly catalogClient?: SupabaseClient<Database> | null;
  /**
   * A single real, payment-gated demo resource (`demo-resource.ts`),
   * mounted at `GET /demo/temperature-convert` when configured. `null`/
   * omitted serves the facilitator alone, unchanged: this is optional
   * evidence infrastructure (a real resource for search/discovery to be
   * evaluated against), not a facilitator capability.
   */
  readonly demoResource?: DemoResourceConfig | null;
}

export function createFacilitatorApp(
  core: FacilitatorCore,
  options: CreateFacilitatorAppOptions = {}
): Hono {
  const app = new Hono();
  const catalogClient = options.catalogClient ?? null;
  const telemetry = createTelemetryTracker();

  // Global, wraps every route registered below it (Hono middleware order:
  // a `use("*", ...)` applies to routes matched after its own
  // registration). Records real wall-clock latency and whether the
  // response was an error (>= 400), the two request-level fields
  // `/status` reports (spec §8/§9/§10), aggregate only, no request body
  // or path captured.
  app.use("*", async (c, next) => {
    const startedAt = Date.now();
    await next();
    telemetry.recordRequest(Date.now() - startedAt, c.res.status >= 400);
  });

  if (options.demoResource) {
    mountDemoResource(app, core, options.demoResource, catalogClient);
  }

  // No claim beyond what's true today: this is an API-only service
  // (apps/hub, the human-facing developer hub, is Phase 9 and doesn't
  // exist yet, spec §5). The root route exists so hitting the bare host
  // in a browser explains itself instead of 404ing with no context.
  app.get("/", (c) =>
    c.json({
      service: "periplo-facilitator",
      // Deliberately doesn't hardcode which schemes ("exact", "upto")
      // this instance advertises: which are actually registered depends
      // on deployment config (core.ts), and /supported is the real
      // source of truth, this blurb would drift out of sync with it
      // otherwise ("advertised support and reachable support must
      // match", the same principle core.ts's own signer-loading
      // comments state).
      description: "x402 facilitator for Stellar: verify/settle/supported, schemes per /supported.",
      endpoints: {
        health: "/health",
        status: "/status",
        supported: "/supported",
        verify: "POST /verify",
        settle: "POST /settle",
        discoveryResources: "GET /discovery/resources",
        discoverySearch: "GET /discovery/search",
        ...(options.demoResource ? { demoResource: "GET /demo/temperature-convert" } : {}),
      },
      repository: "https://github.com/Eras256/Periplo",
    })
  );

  app.get("/health", (c) => c.json({ status: "ok" }));

  // Operational telemetry (spec §8/§9/§10): uptime, latency p50/p95,
  // error rate, catalog size, last settled transaction per network.
  // Aggregate only, self-hosted, no PII: nothing here is per-request
  // identity, just counters and timing. `catalogSize` is `null` (not an
  // error status) when no `catalogClient` is configured, the same
  // degrade-rather-than-fail posture `/discovery/*` uses for the same
  // reason, or when the live count query itself fails, so a transient
  // Supabase hiccup doesn't take `/status` itself down.
  app.get("/status", async (c) => {
    const snapshot = telemetry.getSnapshot();
    let catalogSize: number | null = null;
    if (catalogClient) {
      try {
        catalogSize = await countCatalogResources(catalogClient);
      } catch {
        catalogSize = null;
      }
    }
    return c.json({
      uptimeSeconds: snapshot.uptimeSeconds,
      requestsServed: snapshot.requestsServed,
      errorRate: snapshot.errorRate,
      latencyP50Ms: snapshot.latencyP50Ms,
      latencyP95Ms: snapshot.latencyP95Ms,
      catalogSize,
      lastSettledTransaction: snapshot.lastSettledTransaction,
    });
  });

  // Always advertised: the extension mechanism (validate + report via
  // EXTENSION-RESPONSES) works whether or not `catalogClient` is
  // configured, see `CreateFacilitatorAppOptions`. `core.getSupported()`
  // itself knows nothing about bazaar (spec §1: not reimplemented in
  // core.ts, which stays pure Stellar-scheme wiring), so this is merged
  // in at the HTTP layer, where the extension is actually processed.
  app.get("/supported", (c) => {
    const supported = core.getSupported();
    return c.json({
      ...supported,
      extensions: [...new Set([...supported.extensions, BAZAAR.key])],
    });
  });

  app.post("/verify", async (c) => {
    let json: unknown;
    try {
      json = await c.req.json();
    } catch {
      return c.json({ isValid: false, invalidReason: "invalid_request_body_not_json" }, 400);
    }
    const parsed = verifyOrSettleRequestSchema.safeParse(json);
    if (!parsed.success) {
      return c.json(
        {
          isValid: false,
          invalidReason: "invalid_request_shape",
          invalidMessage: parsed.error.message,
        },
        400
      );
    }
    const { paymentPayload, paymentRequirements } = toSdkTypes(parsed.data);
    const result = await core.verify(paymentPayload, paymentRequirements);

    // Cataloging never runs here, only at /settle below. `isValid: true`
    // proves the payload is a well-formed, correctly-signed authorization
    // that COULD settle, not that any payment happened: no funds move on
    // verify, and a signed-but-never-submitted payload still verifies. The
    // spec text (`specs/extensions/bazaar.md` Facilitator Behavior) does
    // not actually require settlement before cataloging, so a verify-side
    // catalog write is conforming, but it is the reading that lets a
    // catalog entry be minted for the cost of one HTTP request and no
    // balance, which is exactly the ambiguity x402-foundation/x402#3226
    // is auditing in public right now, with real evidence of it happening.
    // Settle-only is the stronger guarantee and the reading this
    // facilitator commits to. See docs/DEFERRED.md for the record.
    return c.json(result);
  });

  app.post("/settle", async (c) => {
    let json: unknown;
    try {
      json = await c.req.json();
    } catch {
      return c.json(
        {
          success: false,
          network: "stellar:testnet",
          transaction: "",
          errorReason: "invalid_request_body_not_json",
        },
        400
      );
    }
    const parsed = verifyOrSettleRequestSchema.safeParse(json);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          network:
            (json as { paymentRequirements?: { network?: string } })?.paymentRequirements
              ?.network ?? "unknown",
          transaction: "",
          errorReason: "invalid_request_shape",
          errorMessage: parsed.error.message,
        },
        400
      );
    }
    const { paymentPayload, paymentRequirements } = toSdkTypes(parsed.data);
    const result = await core.settle(paymentPayload, paymentRequirements);

    // The only place cataloging runs: `result.success` means the payment
    // actually settled, real funds moved. This is deliberately the whole
    // gate, not "verify or settle" — see the comment on /verify above.
    if (result.success) {
      telemetry.recordSettlement(result.network, result.transaction);
      const bazaarResult = await processBazaarExtension(
        paymentPayload,
        paymentRequirements,
        catalogClient
      );
      if (bazaarResult) {
        const extensionResponses = { [BAZAAR.key]: bazaarResult };
        c.header("EXTENSION-RESPONSES", encodeExtensionResponsesHeader(extensionResponses));
        // Echoed in the body two ways, both already part of @x402/core's
        // SettleResponse type: the existing `extensions` field (below,
        // populated since 2026-08-26, untouched here) and, as of
        // x402-foundation/x402#3306 (merged 2026-08-31), a distinct
        // `extensionResponses` field. #3306 rejected the community PRs'
        // shape (folding this into `extensions`) and introduced
        // `extensionResponses` instead, so both fields carry the same
        // content here during the transition window: `extensions` for a
        // caller still on the pre-#3306 shape, `extensionResponses` for
        // one on the new shape. Neither replaces the other.
        //
        // Sending `extensionResponses` in the body has no effect on the
        // official HTTPFacilitatorClient, though, confirmed reading the
        // real merged source (`httpFacilitatorClient.ts` on `main`):
        // `extensionResponses` isn't a field in `settleResponseSchema`/
        // `verifyResponseSchema` at all, so Zod strips it from the
        // parsed body, and `attachExtensionResponsesFromHeader` then
        // sets it purely from the `EXTENSION-RESPONSES` header this
        // facilitator already sends correctly. That client gets
        // `extensionResponses` for free, from the header, no body change
        // needed. Sending it here is for any other caller reading the
        // JSON body directly, the same reasoning `extensions` itself was
        // added under originally.
        return c.json({ ...result, extensions: extensionResponses, extensionResponses });
      }
    }

    return c.json(result);
  });

  // Same "no hard dependency on a catalog database" posture as cataloging
  // itself (discovery.ts): explicit 503 with a reason, not a silent empty
  // 200, when no catalogClient is configured, an empty result set would
  // misrepresent "nothing matched" as "nothing is cataloged here at all."
  function requireCatalogClient(c: Context) {
    if (!catalogClient) {
      c.status(503);
      return c.json({ error: "discovery is not configured on this facilitator" });
    }
    return null;
  }

  function parseIntParam(value: string | undefined): number | undefined {
    if (value === undefined) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  // `exactOptionalPropertyTypes` (tsconfig.base.json) treats `key: undefined`
  // as distinct from an omitted key, and both `ListDiscoveryResourcesParams`
  // and `SearchDiscoveryResourcesParams` declare their optional fields the
  // narrow way (`type?: string`, not `type?: string | undefined`), so an
  // absent query param has to become an omitted key, not a present
  // `undefined` value, or the object literal doesn't typecheck against
  // either param type.
  // Returns `unknown`, not `T`: `T` would still say "key present, value
  // possibly undefined" (inferred from the object literal at each call
  // site), which `exactOptionalPropertyTypes` correctly refuses to accept
  // where the target type says "key may be absent, never undefined",
  // callers cast to the real target type, the same boundary-cast pattern
  // `toSdkTypes` above uses once the runtime shape is right but the
  // static type needs a nudge.
  function compact(obj: Record<string, unknown>): unknown {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
  }

  app.get("/discovery/resources", async (c) => {
    const notConfigured = requireCatalogClient(c);
    if (notConfigured) return notConfigured;

    const result = await listDiscoveryResources(
      { client: catalogClient as SupabaseClient<Database> },
      compact({
        type: c.req.query("type"),
        payTo: c.req.query("payTo"),
        network: c.req.query("network"),
        extensions: c.req.query("extensions"),
        limit: parseIntParam(c.req.query("limit")),
        offset: parseIntParam(c.req.query("offset")),
      }) as Parameters<typeof listDiscoveryResources>[1]
    );
    return c.json(result);
  });

  app.get("/discovery/search", async (c) => {
    const notConfigured = requireCatalogClient(c);
    if (notConfigured) return notConfigured;

    const query = c.req.query("query");
    if (!query) {
      c.status(400);
      return c.json({ error: "query is required" });
    }

    const queryEmbedding = await embedQuery(query);
    const result = await searchDiscoveryResources(
      { client: catalogClient as SupabaseClient<Database> },
      compact({
        query,
        type: c.req.query("type"),
        payTo: c.req.query("payTo"),
        network: c.req.query("network"),
        extensions: c.req.query("extensions"),
        limit: parseIntParam(c.req.query("limit")),
        cursor: c.req.query("cursor"),
      }) as Parameters<typeof searchDiscoveryResources>[1],
      queryEmbedding
    );
    return c.json(result);
  });

  return app;
}
