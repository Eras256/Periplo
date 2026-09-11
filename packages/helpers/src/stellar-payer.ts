/**
 * The real `PaymentPayer` (`buyer-client.ts`) for a Stellar `exact`
 * payment: `x402Client` (`@x402/core/client`) registered with
 * `ExactStellarScheme` (`@x402/stellar/exact/client`) and a real Ed25519
 * signer, the same construction `scripts/demo-resource-settle.ts`
 * already proved catalogs correctly (`x402Client.createPaymentPayload`
 * builds the complete payload, `resource` field included, which is what
 * a resource server's own bazaar cataloging requires). Kept in its own
 * file so `buyer-client.ts`'s orchestration logic has no Stellar SDK
 * import of its own and stays testable against a fake `PaymentPayer`
 * with no key.
 */

import { x402Client } from "@x402/core/client";
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
  const client = new x402Client().register(network, new ExactStellarScheme(signer));
  return {
    network,
    createPaymentPayload: (paymentRequired) => client.createPaymentPayload(paymentRequired),
  };
}
