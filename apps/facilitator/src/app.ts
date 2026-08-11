/**
 * The Hono HTTP layer — a thin wrapper around `FacilitatorCore`
 * (`core.ts`). This is deployment path 1/2 (hosted / self-hosted, spec §5
 * Phase 3); path 3 (self-facilitation inside a resource server) imports
 * `createFacilitatorCore` from `core.ts` directly and skips this file
 * entirely — no HTTP hop needed when the caller is in the same process.
 */

import type { Database } from "@periplo/bazaar";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { BAZAAR } from "@x402/extensions/bazaar";
import { Hono } from "hono";
import type { FacilitatorCore } from "./core.js";
import { processBazaarExtension } from "./discovery.js";
import { type VerifyOrSettleRequestBody, verifyOrSettleRequestSchema } from "./schemas.js";

/**
 * `zod` validates the wire shape at the boundary; the SDK's own types are
 * stricter about pass-through metadata we deliberately don't deep-validate
 * ourselves (e.g. `resource: ResourceInfo` vs. our schema's looser
 * `unknown`) — `@x402/stellar` validates anything that actually matters
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
   * outcome via `EXTENSION-RESPONSES` without persisting anything — the
   * facilitator core has no hard dependency on a catalog database; only
   * this HTTP layer's cataloging step does.
   */
  readonly catalogClient?: SupabaseClient<Database> | null;
}

export function createFacilitatorApp(
  core: FacilitatorCore,
  options: CreateFacilitatorAppOptions = {}
): Hono {
  const app = new Hono();
  const catalogClient = options.catalogClient ?? null;

  // No claim beyond what's true today: this is an API-only service
  // (apps/hub, the human-facing developer hub, is Phase 9 and doesn't
  // exist yet — spec §5). The root route exists so hitting the bare host
  // in a browser explains itself instead of 404ing with no context.
  app.get("/", (c) =>
    c.json({
      service: "periplo-facilitator",
      description: "x402 facilitator for Stellar — verify/settle/supported for the exact scheme.",
      endpoints: {
        health: "/health",
        supported: "/supported",
        verify: "POST /verify",
        settle: "POST /settle",
      },
      repository: "https://github.com/Eras256/Periplo",
    })
  );

  app.get("/health", (c) => c.json({ status: "ok" }));

  // Always advertised: the extension mechanism (validate + report via
  // EXTENSION-RESPONSES) works whether or not `catalogClient` is
  // configured — see `CreateFacilitatorAppOptions`. `core.getSupported()`
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

    // Cataloging only runs against a payload that actually verified — the
    // facilitator is a trust boundary (spec Phase 1); an unverified
    // payload's echoed `resource`/extensions are not yet trustworthy.
    if (result.isValid) {
      const bazaarResult = await processBazaarExtension(
        paymentPayload,
        paymentRequirements,
        catalogClient
      );
      if (bazaarResult) {
        c.header(
          "EXTENSION-RESPONSES",
          encodeExtensionResponsesHeader({ [BAZAAR.key]: bazaarResult })
        );
      }
    }

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

    // Same trust-boundary rule as /verify: only a settled payment's echoed
    // extensions are cataloged.
    if (result.success) {
      const bazaarResult = await processBazaarExtension(
        paymentPayload,
        paymentRequirements,
        catalogClient
      );
      if (bazaarResult) {
        c.header(
          "EXTENSION-RESPONSES",
          encodeExtensionResponsesHeader({ [BAZAAR.key]: bazaarResult })
        );
      }
    }

    return c.json(result);
  });

  return app;
}
