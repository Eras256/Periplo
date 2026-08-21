/**
 * Manual/occasional verification tool, NOT part of `pnpm test`: an
 * attempted second signer mode for the `exact` scheme conformance
 * evidence, alongside `settle-demo.ts`'s single-master-key case. Every
 * settled transaction recorded before this one signed the buyer's
 * payment with that account's own master key. This script attempts the
 * same real facilitator path (`verify()` then `settle()`, no mocks) with
 * the payment instead authorized by a *different*, non-master-key signer
 * registered on the same account: classic Stellar multisig, not a
 * Soroban smart account.
 *
 * **Currently fails before reaching the facilitator, at
 * `client.createPaymentPayload()`, with a real, root-caused upstream bug
 * in `@stellar/stellar-sdk`, not a bug in this script or in
 * `@x402/stellar`.** Full writeup, reproduction, and duplicate-check in
 * `docs/DEFERRED.md`'s "A second `exact`-scheme signer mode was attempted
 * for real" section. `ensureSecondSignerRegistered()` below still runs
 * to completion and is real, verified evidence on its own (a genuine
 * on-chain multisig setup), the failure is specifically in
 * `AssembledTransaction.signAuthEntries` discarding the signer's own
 * returned address before it reaches `authorizeEntry()`'s verification
 * step. Kept in the repo as a real, run reproduction, not deleted just
 * because it doesn't complete yet.
 *
 * `@x402/stellar`'s `ClientStellarSigner` interface
 * (`{ address, signAuthEntry, signTransaction? }`) is signer-agnostic by
 * design (SEP-43): it never assumes the signing keypair matches
 * `address`. That's what makes this possible with zero changes to
 * `@x402/stellar` or this repo's own facilitator core. The buyer account
 * (`STELLAR_TEST_BUYER_PUBLIC`) has a second Ed25519 key registered as an
 * additional signer (weight 1, default 0 thresholds, so any registered
 * signer's signature already satisfies every operation), added once by
 * `ensureSecondSignerRegistered()` below (idempotent, checked live
 * against Horizon, not assumed from a prior run). This script signs with
 * that second key only; the buyer's master key is never touched.
 *
 * This is deliberately NOT the Soroban smart-account / `__check_auth`
 * path Phase 6b already investigated and left open
 * (`OpenZeppelin/stellar-contracts#839`, standing instruction: that
 * diagnostic round is closed, no more angles without a new concrete
 * trigger). Classic multisig is a different, simpler mechanism at the
 * Stellar protocol layer, not a Soroban contract at all, so it doesn't
 * touch that blocked investigation.
 *
 * Usage (from repo root, after `nvm use 22`):
 *   node --env-file=.env apps/facilitator/scripts/multisig-signer-demo.ts
 */

import { Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import type { ClientStellarSigner } from "@x402/stellar";
import { ExactStellarScheme as ExactStellarClientScheme } from "@x402/stellar/exact/client";
import { createFacilitatorCore } from "../src/core.js";

const HORIZON_URL = "https://horizon-testnet.stellar.org";

const FEE_SPONSOR_SECRET = process.env.STELLAR_FEE_SPONSOR_SECRET;
const BUYER_PUBLIC = process.env.STELLAR_TEST_BUYER_PUBLIC;
const BUYER_SECRET = process.env.STELLAR_TEST_BUYER_SECRET;
const SECOND_SIGNER_PUBLIC = process.env.STELLAR_TEST_BUYER_SECOND_SIGNER_PUBLIC;
const SECOND_SIGNER_SECRET = process.env.STELLAR_TEST_BUYER_SECOND_SIGNER_SECRET;
const SELLER_PUBLIC = process.env.STELLAR_TEST_SELLER_PUBLIC;
const ASSET_ADDRESS = process.env.STELLAR_TEST_ASSET_ADDRESS;

const required = {
  STELLAR_FEE_SPONSOR_SECRET: FEE_SPONSOR_SECRET,
  STELLAR_TEST_BUYER_PUBLIC: BUYER_PUBLIC,
  STELLAR_TEST_BUYER_SECRET: BUYER_SECRET,
  STELLAR_TEST_BUYER_SECOND_SIGNER_PUBLIC: SECOND_SIGNER_PUBLIC,
  STELLAR_TEST_BUYER_SECOND_SIGNER_SECRET: SECOND_SIGNER_SECRET,
  STELLAR_TEST_SELLER_PUBLIC: SELLER_PUBLIC,
  STELLAR_TEST_ASSET_ADDRESS: ASSET_ADDRESS,
};
for (const [name, value] of Object.entries(required)) {
  if (!value) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
}

type HorizonAccount = {
  sequence: string;
  signers: Array<{ key: string; weight: number; type: string }>;
};

async function fetchAccount(publicKey: string): Promise<HorizonAccount> {
  const res = await fetch(`${HORIZON_URL}/accounts/${publicKey}`);
  if (!res.ok) throw new Error(`Horizon account lookup failed: ${res.status}`);
  return (await res.json()) as HorizonAccount;
}

/**
 * Idempotent: registers the second signer on the buyer account if it
 * isn't already there. Checked live against Horizon on every run, not
 * assumed from a prior run's success.
 */
async function ensureSecondSignerRegistered(): Promise<void> {
  const account = await fetchAccount(BUYER_PUBLIC as string);
  const alreadyRegistered = account.signers.some(
    (s) => s.key === SECOND_SIGNER_PUBLIC && s.weight > 0
  );
  if (alreadyRegistered) {
    console.log(`Second signer ${SECOND_SIGNER_PUBLIC} already registered on buyer account.`);
    return;
  }

  console.log(`Registering ${SECOND_SIGNER_PUBLIC} as a second signer on the buyer account...`);
  const source = await fetchAccount(BUYER_PUBLIC as string);
  const { Account } = await import("@stellar/stellar-sdk");
  const sourceAccount = new Account(BUYER_PUBLIC as string, source.sequence);
  const tx = new TransactionBuilder(sourceAccount, {
    fee: "10000",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.setOptions({
        signer: { ed25519PublicKey: SECOND_SIGNER_PUBLIC as string, weight: 1 },
      })
    )
    .setTimeout(60)
    .build();
  tx.sign(Keypair.fromSecret(BUYER_SECRET as string));

  const submitRes = await fetch(`${HORIZON_URL}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `tx=${encodeURIComponent(tx.toXDR())}`,
  });
  const submitBody = (await submitRes.json()) as { successful?: boolean; extras?: unknown };
  if (!submitRes.ok || submitBody.successful !== true) {
    console.error("Failed to register second signer:", JSON.stringify(submitBody, null, 2));
    process.exit(1);
  }
  console.log("Second signer registered, real testnet transaction confirmed.");
}

async function main(): Promise<void> {
  await ensureSecondSignerRegistered();

  const core = await createFacilitatorCore({
    signers: { "stellar:testnet": FEE_SPONSOR_SECRET as string },
  });

  // The signer object's `address` is the buyer ACCOUNT (the master key's
  // own address); the actual cryptographic signing happens with the
  // SECOND keypair. `@x402/stellar` and the underlying Soroban/classic
  // signature-verification path never assume these match, this is
  // exactly the SEP-43 signer-agnosticism the interface is built for.
  const secondSignerKeypair = Keypair.fromSecret(SECOND_SIGNER_SECRET as string);
  const { signTransaction, signAuthEntry } = basicNodeSigner(secondSignerKeypair, Networks.TESTNET);
  const multisigBuyerSigner: ClientStellarSigner = {
    address: BUYER_PUBLIC as string,
    signAuthEntry,
    signTransaction,
  };

  const client = new ExactStellarClientScheme(multisigBuyerSigner);

  const paymentRequirements = {
    scheme: "exact",
    network: "stellar:testnet" as const,
    asset: ASSET_ADDRESS as string,
    amount: "1000000", // 0.1 PTEST (7 decimals)
    payTo: SELLER_PUBLIC as string,
    maxTimeoutSeconds: 300,
    extra: { areFeesSponsored: true },
  };

  console.log(
    `Building and signing payment payload as the buyer's SECOND signer (${SECOND_SIGNER_PUBLIC}), not the master key (${BUYER_PUBLIC})...`
  );
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

  console.log(
    `\nSETTLED on stellar:testnet via a non-master-key (multisig) signer: transaction hash: ${settleResult.transaction}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
