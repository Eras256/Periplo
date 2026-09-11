/**
 * The real `PaymentPayer` (`buyer-client.ts`) for a Stellar `exact`
 * payment: `createEd25519Signer` + `ExactStellarScheme` from
 * `@x402/stellar/exact/client`, the same pair
 * `demo-play-client.ts` already proved live, twice. Kept in its own file
 * so `buyer-client.ts`'s orchestration logic has no Stellar SDK import of
 * its own and stays testable against a fake `PaymentPayer` with no key.
 */

import type { Network } from "@x402/core/types";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import type { PaymentPayer } from "./buyer-client.js";

/**
 * Builds a `PaymentPayer` signing with a plain Ed25519 Stellar secret key
 * for the `exact` scheme on `network` (e.g. "stellar:testnet"). The
 * secret never leaves this process: `createEd25519Signer` holds it, this
 * function only exposes `createPaymentPayload`.
 */
export function createExactStellarPayer(secretKey: string, network: Network): PaymentPayer {
  const signer = createEd25519Signer(secretKey, network);
  const scheme = new ExactStellarScheme(signer);
  return {
    network,
    createPaymentPayload: (x402Version, requirements) =>
      scheme.createPaymentPayload(x402Version, requirements),
  };
}
