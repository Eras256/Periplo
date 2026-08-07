/**
 * Zod schemas for the OUTER request envelope only — `{ x402Version,
 * paymentPayload, paymentRequirements }` — confirmed against the real
 * reference facilitator (`conformance/baseline/x402-org/verify-settle-malformed.md`)
 * and `@x402/core`'s `VerifyRequest`/`SettleRequest` types.
 *
 * Deliberately does NOT validate the mechanism-specific INNER payload
 * (`payload.transaction`, asset addresses, etc.) — the reference
 * facilitator's own behavior (captured, not guessed) is to accept any
 * well-shaped envelope with `200` and report inner-payload problems as
 * `isValid: false` / `success: false` in the body, not as an HTTP 400.
 * `@x402/stellar`'s `ExactStellarScheme` is what actually validates the
 * inner payload (spec §1: don't reimplement verify/settle) — these
 * schemas only guard the shape needed to safely call into it at all.
 */

import { z } from "zod";

const paymentRequirementsSchema = z.object({
  scheme: z.string(),
  network: z.string(),
  asset: z.string(),
  amount: z.string(),
  payTo: z.string(),
  maxTimeoutSeconds: z.number(),
  extra: z.record(z.string(), z.unknown()),
});

const paymentPayloadSchema = z.object({
  x402Version: z.number(),
  resource: z.unknown().optional(),
  accepted: paymentRequirementsSchema,
  payload: z.record(z.string(), z.unknown()),
  extensions: z.record(z.string(), z.unknown()).optional(),
});

export const verifyOrSettleRequestSchema = z.object({
  x402Version: z.number(),
  paymentPayload: paymentPayloadSchema,
  paymentRequirements: paymentRequirementsSchema,
});

export type VerifyOrSettleRequestBody = z.infer<typeof verifyOrSettleRequestSchema>;
