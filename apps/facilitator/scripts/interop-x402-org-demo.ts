/**
 * Real interoperability evidence: a payment built and signed with this
 * project's own buyer test fixture, verified and SETTLED through a
 * completely independent, third-party facilitator (`x402.org`'s public
 * reference implementation), not this project's own `core.ts`. Proves
 * Periplo's own wire-format usage (the exact same `@x402/stellar` client
 * scheme `settle-demo.ts` uses against our own facilitator) isn't just
 * self-consistent, it interoperates with a different team's independent
 * implementation of the same spec. Confirmed live before running this:
 * `GET https://x402.org/facilitator/supported` lists
 * `{"scheme":"exact","network":"stellar:testnet","extra":{"areFeesSponsored":true}}`,
 * see `conformance/baseline/x402-org/supported.md` for the captured
 * transcript this reconfirms is still accurate.
 *
 * Manual/occasional verification tool, NOT part of `pnpm test`, same
 * pattern as `settle-demo.ts`: spends a small amount of the test buyer's
 * PTEST balance and depends on a third party's live service being up.
 *
 * Usage (from repo root, after `nvm use 22`):
 *   node --env-file=apps/facilitator/.env apps/facilitator/scripts/interop-x402-org-demo.ts
 */

import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme as ExactStellarClientScheme } from "@x402/stellar/exact/client";

const BUYER_SECRET = process.env.STELLAR_TEST_BUYER_SECRET;
const SELLER_PUBLIC = process.env.STELLAR_TEST_SELLER_PUBLIC;
const ASSET_ADDRESS = process.env.STELLAR_TEST_ASSET_ADDRESS;

if (!BUYER_SECRET || !SELLER_PUBLIC || !ASSET_ADDRESS) {
  console.error(
    "Missing one of: STELLAR_TEST_BUYER_SECRET, STELLAR_TEST_SELLER_PUBLIC, STELLAR_TEST_ASSET_ADDRESS"
  );
  process.exit(1);
}

const REFERENCE_FACILITATOR = "https://x402.org/facilitator";

async function main(): Promise<void> {
  console.log(`Confirming ${REFERENCE_FACILITATOR}/supported still lists stellar:testnet...`);
  const supportedRes = await fetch(`${REFERENCE_FACILITATOR}/supported`);
  const supported = (await supportedRes.json()) as {
    kinds: Array<{ scheme: string; network: string }>;
  };
  const stellarKind = supported.kinds.find(
    (k) => k.network === "stellar:testnet" && k.scheme === "exact"
  );
  if (!stellarKind) {
    console.error("x402.org no longer advertises exact/stellar:testnet — aborting.");
    process.exit(1);
  }
  console.log("Confirmed live:", JSON.stringify(stellarKind));

  const buyerSigner = createEd25519Signer(BUYER_SECRET as string, "stellar:testnet");
  const client = new ExactStellarClientScheme(buyerSigner);

  const paymentRequirements = {
    scheme: "exact",
    network: "stellar:testnet" as const,
    asset: ASSET_ADDRESS as string,
    amount: "100000", // 0.01 PTEST
    payTo: SELLER_PUBLIC as string,
    maxTimeoutSeconds: 300,
    extra: { areFeesSponsored: true },
  };

  console.log("\nBuilding and signing payment payload as the buyer (Periplo's own client code)...");
  const built = await client.createPaymentPayload(2, paymentRequirements);
  const paymentPayload = { ...built, accepted: paymentRequirements };
  const requestBody = JSON.stringify({
    x402Version: 2,
    paymentPayload,
    paymentRequirements,
  });

  console.log(`\nPOST ${REFERENCE_FACILITATOR}/verify (x402.org's own facilitator, not ours)...`);
  const verifyRes = await fetch(`${REFERENCE_FACILITATOR}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: requestBody,
  });
  const verifyResult = await verifyRes.json();
  console.log("verify result:", JSON.stringify(verifyResult, null, 2));

  if (!(verifyResult as { isValid?: boolean }).isValid) {
    console.error("x402.org rejected verification. Aborting before settle.");
    process.exit(1);
  }

  console.log(`\nPOST ${REFERENCE_FACILITATOR}/settle (x402.org's own facilitator, not ours)...`);
  const settleRes = await fetch(`${REFERENCE_FACILITATOR}/settle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: requestBody,
  });
  const settleResult = (await settleRes.json()) as {
    success?: boolean;
    transaction?: string;
    errorReason?: string;
  };
  console.log("settle result:", JSON.stringify(settleResult, null, 2));

  if (!settleResult.success || !settleResult.transaction) {
    console.error("x402.org settlement failed.");
    process.exit(1);
  }

  console.log(
    `\nSETTLED via x402.org's independent facilitator: transaction hash: ${settleResult.transaction}`
  );
  console.log(`https://stellar.expert/explorer/testnet/tx/${settleResult.transaction}`);

  console.log("\nVerifying independently against Horizon...");
  const horizonRes = await fetch(
    `https://horizon-testnet.stellar.org/transactions/${settleResult.transaction}`
  );
  const horizonTx = (await horizonRes.json()) as {
    successful?: boolean;
    source_account?: string;
    ledger?: number;
    fee_charged?: string;
  };
  console.log(
    `Horizon: successful=${horizonTx.successful} source_account=${horizonTx.source_account} ` +
      `ledger=${horizonTx.ledger} fee_charged=${horizonTx.fee_charged}`
  );
  console.log(
    "\nNote: source_account is x402.org's OWN fee-sponsor, not Periplo's — proof this settled " +
      "through their independent infrastructure, not ours."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
