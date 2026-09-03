/**
 * Manual/occasional verification tool, NOT part of `pnpm test`, same
 * pattern as `settle-demo.ts`: proves the channel-account pool (spec §2/
 * §7's sequence-number bottleneck under bursty traffic) actually gets
 * used, not just configured. Builds N real, distinct signed payments and
 * settles them CONCURRENTLY through this repo's own facilitator core,
 * then checks each resulting transaction's real source account on
 * Horizon: multiple distinct addresses appearing proves the pool's
 * round-robin selection engaged, and every settlement succeeding proves
 * the concurrent calls didn't serialize or collide on a shared sequence
 * number the way a single-account facilitator would risk under the same
 * burst (`tx_bad_seq`).
 *
 * Each run submits N real testnet transactions and spends a small amount
 * of the test buyer's PTEST balance, deliberately not wired into the
 * default test suite for that reason, same as `settle-demo.ts`.
 *
 * Usage (from repo root, after `nvm use 22`):
 *   node --env-file=apps/facilitator/.env apps/facilitator/scripts/channel-accounts-burst-demo.ts
 */

import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme as ExactStellarClientScheme } from "@x402/stellar/exact/client";
import { createFacilitatorCore } from "../src/core.js";

const FEE_SPONSOR_SECRET = process.env.STELLAR_FEE_SPONSOR_SECRET;
const CHANNEL_ACCOUNT_SECRETS = process.env.STELLAR_CHANNEL_ACCOUNT_SECRETS_TESTNET;
const BUYER_SECRET = process.env.STELLAR_TEST_BUYER_SECRET;
const SELLER_PUBLIC = process.env.STELLAR_TEST_SELLER_PUBLIC;
const ASSET_ADDRESS = process.env.STELLAR_TEST_ASSET_ADDRESS;
const MAX_TRANSACTION_FEE_STROOPS = process.env.MAX_TRANSACTION_FEE_STROOPS
  ? Number(process.env.MAX_TRANSACTION_FEE_STROOPS)
  : undefined;

if (
  !FEE_SPONSOR_SECRET ||
  !CHANNEL_ACCOUNT_SECRETS ||
  !BUYER_SECRET ||
  !SELLER_PUBLIC ||
  !ASSET_ADDRESS
) {
  console.error(
    "Missing one of: STELLAR_FEE_SPONSOR_SECRET, STELLAR_CHANNEL_ACCOUNT_SECRETS_TESTNET, " +
      "STELLAR_TEST_BUYER_SECRET, STELLAR_TEST_SELLER_PUBLIC, STELLAR_TEST_ASSET_ADDRESS"
  );
  process.exit(1);
}

async function buildSignedPayment(index: number) {
  const buyerSigner = createEd25519Signer(BUYER_SECRET as string, "stellar:testnet");
  const client = new ExactStellarClientScheme(buyerSigner);
  const paymentRequirements = {
    scheme: "exact",
    network: "stellar:testnet" as const,
    asset: ASSET_ADDRESS as string,
    amount: "100000", // 0.01 PTEST, small enough that N of these survive many re-runs
    payTo: SELLER_PUBLIC as string,
    maxTimeoutSeconds: 300,
    extra: { areFeesSponsored: true },
  };
  console.log(`[${index}] building and signing payment payload as the buyer...`);
  const built = await client.createPaymentPayload(2, paymentRequirements);
  return { paymentPayload: { ...built, accepted: paymentRequirements }, paymentRequirements };
}

interface FetchedTx {
  readonly source_account: string;
  readonly successful: boolean;
}

async function fetchSourceAccount(hash: string): Promise<FetchedTx> {
  const response = await fetch(`https://horizon-testnet.stellar.org/transactions/${hash}`);
  if (!response.ok) {
    throw new Error(`Horizon lookup failed for ${hash}: HTTP ${response.status}`);
  }
  const json = (await response.json()) as FetchedTx;
  return json;
}

async function main(): Promise<void> {
  const poolSize = (CHANNEL_ACCOUNT_SECRETS as string).split(",").filter(Boolean).length + 1;
  // Exactly one concurrent call per pool member: the clean proof that N
  // channel accounts genuinely support N fully concurrent settlements
  // with zero serialization or sequence collisions. Oversubscribing (more
  // concurrent calls than pool members) is a real, separate, honest limit
  // documented in README.md/docs/DEFERRED.md from an earlier run of this
  // same script rather than asserted here: round-robin wraps and two
  // concurrent calls land on the same account, and exactly one of the two
  // fails cleanly (`settle_exact_stellar_transaction_submission_failed`,
  // a sequence collision) rather than corrupting anything — expected,
  // not a bug, and not what this run is measuring.
  const burstSize = poolSize;

  const core = await createFacilitatorCore({
    signers: { "stellar:testnet": FEE_SPONSOR_SECRET as string },
    channelAccountSecrets: {
      "stellar:testnet": (CHANNEL_ACCOUNT_SECRETS as string).split(",").filter(Boolean),
    },
    ...(MAX_TRANSACTION_FEE_STROOPS !== undefined
      ? { maxTransactionFeeStroops: MAX_TRANSACTION_FEE_STROOPS }
      : {}),
  });

  console.log(
    `Pool size: ${poolSize} (1 primary + ${poolSize - 1} channel accounts). ` +
      `Bursting ${burstSize} concurrent settle() calls...\n`
  );

  const built = await Promise.all(
    Array.from({ length: burstSize }, (_unused, i) => buildSignedPayment(i))
  );

  const started = Date.now();
  const settleResults = await Promise.all(
    built.map(({ paymentPayload, paymentRequirements }, i) =>
      core.settle(paymentPayload, paymentRequirements).then((result) => {
        console.log(`[${i}] settle() resolved: success=${result.success} tx=${result.transaction}`);
        return result;
      })
    )
  );
  const elapsedMs = Date.now() - started;

  const failures = settleResults.filter((r) => !r.success);
  if (failures.length > 0) {
    console.error(`\n${failures.length}/${burstSize} settlements FAILED:`);
    for (const f of failures) console.error(f);
    process.exit(1);
  }

  console.log(
    `\nAll ${burstSize} concurrent settlements succeeded in ${elapsedMs}ms. Checking Horizon for the real source account each one actually used...\n`
  );

  const sourceAccounts = await Promise.all(
    settleResults.map((r) => fetchSourceAccount(r.transaction))
  );
  const distinctSources = new Set(sourceAccounts.map((tx) => tx.source_account));

  sourceAccounts.forEach((tx, i) => {
    console.log(`[${i}] source_account=${tx.source_account} successful=${tx.successful}`);
  });

  console.log(
    `\n${distinctSources.size} distinct source accounts used across ${burstSize} concurrent settlements ` +
      `(pool size ${poolSize}).`
  );
  if (distinctSources.size < 2) {
    console.error(
      "Expected more than one distinct source account — the pool round-robin doesn't appear to be engaging."
    );
    process.exit(1);
  }
  console.log(
    "Channel-account pool confirmed working: round-robin engaged, no serialization needed."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
