/**
 * Real end-to-end verification for `src/demo-resource.ts`: a real signed
 * testnet payment against the ACTUAL deployed
 * `https://periplo-testnet.fly.dev/demo/temperature-convert` (a real HTTP
 * request over the network, not `core.settle()` in-process, and not
 * Hono's in-memory `app.request()`), so the `resource.url` a real client
 * builds -- and that ends up cataloged -- reflects the real deployed
 * host, not `http://localhost/...` (confirmed empirically: Hono's
 * in-memory request harness defaults to that base, which is exactly the
 * class of bug this whole round exists to fix, so this script deliberately
 * avoids it rather than risk cataloging a third bad entry).
 *
 * Manual/occasional verification tool, NOT part of `pnpm test`, same
 * convention as `settle-demo.ts`/`upto-settle-demo.ts`: spends a small
 * amount of the test buyer's PTEST balance on every run.
 *
 * Usage (from repo root, after `nvm use 22`, and after the demo resource
 * is actually deployed -- see docs/DEFERRED.md's "Fly.io redeploy blocked
 * again" entry for what's still needed first):
 *   node --env-file=.env apps/facilitator/scripts/demo-resource-settle.ts
 */

import { x402Client } from "@x402/core/client";
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme as ExactStellarClientScheme } from "@x402/stellar/exact/client";

const BASE_URL = process.env.DEMO_RESOURCE_BASE_URL ?? "https://periplo-testnet.fly.dev";
const BUYER_SECRET = process.env.STELLAR_TEST_BUYER_SECRET;

if (!BUYER_SECRET) {
  console.error("Missing STELLAR_TEST_BUYER_SECRET");
  process.exit(1);
}

async function main(): Promise<void> {
  const url = `${BASE_URL}/demo/temperature-convert?value=100&from=celsius&to=fahrenheit`;

  console.log(`GET ${url} (unpaid)...`);
  const challenge = await fetch(url);
  if (challenge.status !== 402) {
    throw new Error(`expected 402, got ${challenge.status}: ${await challenge.text()}`);
  }
  const paymentRequiredHeader = challenge.headers.get("payment-required");
  if (!paymentRequiredHeader) {
    throw new Error("402 response had no payment-required header");
  }
  const paymentRequired: PaymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);
  console.log(
    `Got PaymentRequired: ${paymentRequired.accepts.length} option(s), resource.url = ${paymentRequired.resource.url}`
  );

  const buyerSigner = createEd25519Signer(BUYER_SECRET as string, "stellar:testnet");
  const client = new x402Client().register(
    "stellar:testnet",
    new ExactStellarClientScheme(buyerSigner)
  );

  console.log("Building and signing payment payload as the buyer...");
  const paymentPayload = await client.createPaymentPayload(paymentRequired);

  console.log(`GET ${url} (paid)...`);
  const paid = await fetch(url, {
    headers: { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(paymentPayload) },
  });

  if (paid.status !== 200) {
    throw new Error(`expected 200, got ${paid.status}: ${await paid.text()}`);
  }
  const body = await paid.json();
  console.log("Response body (real conversion, not a canned response):", body);

  const settlementHeader = paid.headers.get("payment-response");
  if (!settlementHeader) {
    throw new Error("200 response had no payment-response header");
  }
  const settlement = decodePaymentResponseHeader(settlementHeader);
  console.log("Settlement:", JSON.stringify(settlement, null, 2));

  if (!settlement.success) {
    console.error("Settlement failed.");
    process.exit(1);
  }

  console.log(`\nSETTLED on stellar:testnet: transaction hash: ${settlement.transaction}`);
  console.log(`https://stellar.expert/explorer/testnet/tx/${settlement.transaction}`);
  console.log(
    "\nCataloging happened as a side effect of this real settlement (demo-resource.ts's " +
      "onAfterSettle hook), not inserted directly -- re-query GET /discovery/resources to confirm."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
