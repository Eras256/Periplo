/**
 * The Hono HTTP layer — a thin wrapper around `FacilitatorCore`
 * (`core.ts`). This is deployment path 1/2 (hosted / self-hosted, spec §5
 * Phase 3); path 3 (self-facilitation inside a resource server) imports
 * `createFacilitatorCore` from `core.ts` directly and skips this file
 * entirely — no HTTP hop needed when the caller is in the same process.
 */

import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { Hono } from "hono";
import type { FacilitatorCore } from "./core.js";
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

export function createFacilitatorApp(core: FacilitatorCore): Hono {
  const app = new Hono();

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

  app.get("/supported", (c) => c.json(core.getSupported()));

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
    return c.json(result);
  });

  return app;
}
