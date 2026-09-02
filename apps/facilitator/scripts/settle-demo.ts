/**
 * Manual/occasional verification tool, NOT part of `pnpm test`: builds a
 * REAL signed payment on stellar:testnet using `@x402/stellar`'s
 * client-side `ExactStellarScheme`, feeds it through this repo's own
 * facilitator core (`verify()` then `settle()`), and prints the resulting
 * transaction hash. This is what produced the hash recorded in
 * `conformance/RESULTS.md` for the Phase 3 gate.
 *
 * Each run submits a real testnet transaction and spends a small amount
 * of the test buyer's PTEST balance, deliberately not wired into the
 * default test suite for that reason. Phase 8 is where a repeatable,
 * CI-integrated version of this belongs (the actual x402 e2e conformance
 * suite, registered against both networks).
 *
 * Usage (from repo root, after `nvm use 22`):
 *   node --env-file=.env apps/facilitator/scripts/settle-demo.ts
 */

import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme as ExactStellarClientScheme } from "@x402/stellar/exact/client";
import { createFacilitatorCore } from "../src/core.js";

const FEE_SPONSOR_SECRET = process.env.STELLAR_FEE_SPONSOR_SECRET;
const BUYER_SECRET = process.env.STELLAR_TEST_BUYER_SECRET;
const SELLER_PUBLIC = process.env.STELLAR_TEST_SELLER_PUBLIC;
const ASSET_ADDRESS = process.env.STELLAR_TEST_ASSET_ADDRESS;

if (!FEE_SPONSOR_SECRET || !BUYER_SECRET || !SELLER_PUBLIC || !ASSET_ADDRESS) {
  console.error(
    "Missing one of: STELLAR_FEE_SPONSOR_SECRET, STELLAR_TEST_BUYER_SECRET, " +
      "STELLAR_TEST_SELLER_PUBLIC, STELLAR_TEST_ASSET_ADDRESS"
  );
  process.exit(1);
}

// Same optional override `serve.ts` reads for the deployed facilitator
// (undefined leaves the SDK's own 50,000-stroop default in place). Without
// this, the script uses that stale default regardless of what the live
// deployment is actually configured with, and fails on real Soroban
// resource-fee spikes the deployment already tolerates (found running this
// under real protocol 28 testnet conditions, 2026-09-02: fees at 95,461
// stroops, already above the 72,000 that first motivated this override).
const MAX_TRANSACTION_FEE_STROOPS = process.env.MAX_TRANSACTION_FEE_STROOPS
  ? Number(process.env.MAX_TRANSACTION_FEE_STROOPS)
  : undefined;

async function main(): Promise<void> {
  const core = await createFacilitatorCore({
    signers: { "stellar:testnet": FEE_SPONSOR_SECRET as string },
    ...(MAX_TRANSACTION_FEE_STROOPS !== undefined
      ? { maxTransactionFeeStroops: MAX_TRANSACTION_FEE_STROOPS }
      : {}),
  });

  const buyerSigner = createEd25519Signer(BUYER_SECRET as string, "stellar:testnet");
  const client = new ExactStellarClientScheme(buyerSigner);

  const paymentRequirements = {
    scheme: "exact",
    network: "stellar:testnet" as const,
    asset: ASSET_ADDRESS as string,
    amount: "1000000", // 0.1 PTEST (7 decimals), small, so the buyer's balance survives many re-runs
    payTo: SELLER_PUBLIC as string,
    maxTimeoutSeconds: 300,
    // Required by the client scheme itself ("Exact scheme requires
    // areFeesSponsored to be true", found by running this, not guessed):
    // the client needs to know fees are sponsored so it doesn't try to
    // provision its own fee payment when building the transaction.
    extra: { areFeesSponsored: true },
  };

  console.log("Building and signing payment payload as the buyer...");
  const built = await client.createPaymentPayload(2, paymentRequirements);
  const paymentPayload = { ...built, accepted: paymentRequirements };

  console.log("Calling facilitator verify()...");
  const verifyResult = await core.verify(paymentPayload, paymentRequirements);
  console.log("verify result:", JSON.stringify(verifyResult, null, 2));

  if (!verifyResult.isValid) {
    console.error("Verification failed: aborting before settle().");
    process.exit(1);
  }

  console.log("Calling facilitator settle()...");
  const settleResult = await core.settle(paymentPayload, paymentRequirements);
  console.log("settle result:", JSON.stringify(settleResult, null, 2));

  if (!settleResult.success) {
    console.error("Settlement failed.");
    process.exit(1);
  }

  console.log(`\nSETTLED on stellar:testnet: transaction hash: ${settleResult.transaction}`);
  console.log(`https://stellar.expert/explorer/testnet/tx/${settleResult.transaction}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
