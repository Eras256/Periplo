/**
 * Real end-to-end proof of `packages/helpers`' buyer-side
 * `discoverPayAndFetch`, against the ACTUAL live deployment
 * (`https://periplo-testnet.fly.dev`), not a mock and not
 * `app.request()`'s in-memory harness. Mirrors `demo-resource-settle.ts`'s
 * role for the seller-side helper: the strongest evidence this
 * generalization actually works is running it against something already
 * real and deployed, not just unit tests against fakes.
 *
 * Manual/occasional verification tool, NOT part of `pnpm test`, same
 * convention as every other `*-demo.ts` script here: spends a small
 * amount of the test buyer's PTEST balance on every run.
 *
 * Usage (from repo root, after `nvm use 22`):
 *   node --env-file=apps/facilitator/.env apps/facilitator/scripts/buyer-helper-demo.ts
 */

import { createExactStellarPayer, discoverPayAndFetch } from "@periplo/helpers";

const FACILITATOR_BASE_URL =
  process.env.DEMO_RESOURCE_BASE_URL ?? "https://periplo-testnet.fly.dev";
const BUYER_SECRET = process.env.STELLAR_TEST_BUYER_SECRET;
const NETWORK = "stellar:testnet";

if (!BUYER_SECRET) {
  console.error("Missing STELLAR_TEST_BUYER_SECRET");
  process.exit(1);
}

async function main(): Promise<void> {
  const payer = createExactStellarPayer(BUYER_SECRET as string, NETWORK);

  console.log(`Searching ${FACILITATOR_BASE_URL}/discovery/search for "temperature"...`);
  const result = await discoverPayAndFetch(FACILITATOR_BASE_URL, "temperature", payer);

  console.log(`Discovered: ${result.resource.resource}`);
  console.log(`Paid: ${result.paid}`);
  console.log(`Response body:`, result.body);
  if (result.settlement) {
    console.log(`Settled transaction: ${result.settlement.transaction}`);
    console.log(`https://stellar.expert/explorer/testnet/tx/${result.settlement.transaction}`);
  } else {
    console.log("No settlement header on the response.");
  }
}

main().catch((error) => {
  console.error("buyer-helper-demo failed:", error);
  process.exit(1);
});
