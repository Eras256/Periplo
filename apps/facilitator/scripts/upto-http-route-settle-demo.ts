/**
 * Manual/occasional verification tool, NOT part of `pnpm test`: the real
 * proof that `UptoStellarScheme` (`src/upto-stellar-scheme.ts`), wired
 * into `createFacilitatorCore` (`src/core.ts`), actually settles a real
 * `upto` payment through this facilitator's own `verify()`/`settle()`
 * entry points, the same ones `/verify`/`/settle` call over HTTP. This is
 * the counterpart to `settle-demo.ts` (which does the same thing for
 * `exact`) and supersedes `upto-settle-demo.ts` as the evidence for "the
 * facilitator calls `UptoSettlement` from its own routes": that earlier
 * script invoked the deployed contract directly via `Client.from(...)`,
 * proving the contract itself works, but never exercised this
 * facilitator's own HTTP-route code at all.
 *
 * The client side (building and signing the payment) is hand-rolled here
 * with `@stellar/stellar-sdk` directly, not `@x402/stellar`, because that
 * package has no `upto` client (spec §1's "build on `@x402/stellar`"
 * only applies to schemes it actually ships): `Operation.invokeContractFunction`
 * to build the `settle(authorization, actual_amount)` call, `server.simulateTransaction`
 * to discover the required auth entries, `authorizeEntry` to sign the
 * buyer's, matching the mechanics `apps/facilitator/scripts/upto-settle-demo.ts`
 * already exercises directly against the contract, just producing an
 * x402 `PaymentPayload`/`PaymentRequirements` pair instead of submitting
 * directly.
 *
 * Each run submits a real testnet transaction and spends a small amount
 * of the test buyer's PTEST balance, same reason `settle-demo.ts` isn't
 * wired into the default test suite.
 *
 * Usage (from repo root, after `nvm use 22`):
 *   node --env-file=.env apps/facilitator/scripts/upto-http-route-settle-demo.ts
 */

import { randomBytes } from "node:crypto";
import {
  Address,
  authorizeEntry,
  Keypair,
  nativeToScVal,
  Operation,
  rpc,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { getEstimatedLedgerCloseTimeSeconds } from "@x402/stellar";
import { createFacilitatorCore } from "../src/core.js";

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

const FEE_SPONSOR_SECRET = process.env.STELLAR_FEE_SPONSOR_SECRET;
const BUYER_SECRET = process.env.STELLAR_TEST_BUYER_SECRET;
const SELLER_PUBLIC = process.env.STELLAR_TEST_SELLER_PUBLIC;
const ASSET_ADDRESS = process.env.STELLAR_TEST_ASSET_ADDRESS;
const CONTRACT_ID = process.env.UPTO_SETTLEMENT_CONTRACT_TESTNET;

const required = {
  STELLAR_FEE_SPONSOR_SECRET: FEE_SPONSOR_SECRET,
  STELLAR_TEST_BUYER_SECRET: BUYER_SECRET,
  STELLAR_TEST_SELLER_PUBLIC: SELLER_PUBLIC,
  STELLAR_TEST_ASSET_ADDRESS: ASSET_ADDRESS,
  UPTO_SETTLEMENT_CONTRACT_TESTNET: CONTRACT_ID,
};
for (const [name, value] of Object.entries(required)) {
  if (!value) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const server = new rpc.Server(RPC_URL);
  const buyer = Keypair.fromSecret(BUYER_SECRET as string);
  const facilitatorKeypair = Keypair.fromSecret(FEE_SPONSOR_SECRET as string);

  const latestLedger = await server.getLatestLedger();
  const currentLedger = latestLedger.sequence;

  const maxAmount = 1_000_000n; // 0.1 PTEST ceiling
  const actualAmount = 350_000n; // partial settlement, exercises both payout and refund legs
  const validAfterLedger = currentLedger;
  // Spec: "Expiration is currentLedger + ceil(maxTimeoutSeconds /
  // estimatedLedgerSeconds)". maxTimeoutSeconds is set to match below
  // (120s), so the window this client actually signs for is consistent
  // with what it declares to the facilitator; a mismatch here (a fixed
  // ledger offset independent of the declared maxTimeoutSeconds) is
  // exactly what UptoStellarScheme's own maxLedger check exists to catch,
  // found by running this script for real against that check, not by
  // reasoning about it in advance.
  const maxTimeoutSeconds = 120;
  // Same function UptoStellarScheme itself calls, so this script's window
  // matches the facilitator's own tolerance exactly rather than
  // hardcoding an assumed ledger time that turned out to be wrong when
  // actually run (real testnet estimate is 6s/ledger today, not the
  // textbook 5s the spec's own prose uses as an example).
  const estimatedLedgerSeconds = await getEstimatedLedgerCloseTimeSeconds("stellar:testnet");
  const deadlineLedger = currentLedger + Math.ceil(maxTimeoutSeconds / estimatedLedgerSeconds);
  const nonce = randomBytes(32);

  // Placeholder used only so the CLIENT's own trial simulation has some
  // value to build against; irrelevant to what's actually authorized
  // (require_auth_for_args covers (authorization,) only), and never used
  // as the settled amount, matching the spec's own advisory-only framing
  // of everything outside the signed auth entries.
  const clientPlaceholderAmount = maxAmount;

  const authorizationNative = {
    from: buyer.publicKey(),
    to: SELLER_PUBLIC as string,
    asset: ASSET_ADDRESS as string,
    max_amount: maxAmount,
    valid_after_ledger: validAfterLedger,
    deadline_ledger: deadlineLedger,
    nonce,
    facilitator: facilitatorKeypair.publicKey(),
  };
  const authorizationScVal = nativeToScVal(authorizationNative, {
    type: {
      from: ["symbol", "address"],
      to: ["symbol", "address"],
      asset: ["symbol", "address"],
      max_amount: ["symbol", "i128"],
      valid_after_ledger: ["symbol", "u32"],
      deadline_ledger: ["symbol", "u32"],
      nonce: ["symbol", "bytes"],
      facilitator: ["symbol", "address"],
    },
  });

  console.log(
    "Building the CLIENT's trial transaction (a separate account as simulation source, not the buyer)..."
  );
  // Spec: "Clients MUST use a separate, funded G-account as the
  // simulation source when `from` is a C-account. Clients MAY do the
  // same for a G-account payer, for consistency. This source only
  // produces a valid simulation. It is never included in the signed
  // authorization tree and need not be the eventual facilitator." Using
  // the buyer's own account as the simulation source instead (tried
  // first, in an earlier revision of this script) makes the simulator
  // record `authorization.from.require_auth_for_args(...)` as a
  // `sorobanCredentialsSourceAccount` entry (satisfied implicitly by the
  // tx envelope's own signature) instead of a proper
  // `sorobanCredentialsAddress` entry, which is not what a resource
  // server's facilitator later expects to find when it rebuilds the
  // transaction with itself as source; found by actually running this
  // script and inspecting the simulator's recorded credential types, not
  // reasoned about in advance. The seller test fixture is a convenient
  // already-funded account that is neither the buyer nor any facilitator
  // signing address, so it works as this throwaway source.
  const sourceAccount = await server.getAccount(SELLER_PUBLIC as string);
  const clientOp = Operation.invokeContractFunction({
    contract: CONTRACT_ID as string,
    function: "settle",
    args: [authorizationScVal, nativeToScVal(clientPlaceholderAmount, { type: "i128" })],
  });
  const trialTx = new TransactionBuilder(sourceAccount, {
    fee: "10000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .setTimeout(maxTimeoutSeconds)
    .addOperation(clientOp)
    .build();

  const simResponse = await server.simulateTransaction(trialTx);
  if (rpc.Api.isSimulationError(simResponse)) {
    console.error("Client-side simulation failed:", simResponse.error);
    process.exit(1);
  }
  const recordedAuth = simResponse.result?.auth ?? [];

  // Soroban's simulator records EVERY require_auth()/require_auth_for_args()
  // call it encounters, not just the buyer's (the spec's own warning:
  // "simulation records require_auth() without verifying signatures").
  // That includes `authorization.facilitator.require_auth()`, which
  // produces a second entry here for the FACILITATOR's address, one this
  // client has no business signing (and structurally can't: it has no
  // facilitator key). The spec's own protocol flow only ever describes
  // the client signing "the auth entries: the root invocation restricted
  // to (authorization,), plus the SEP-41 transfer sub-invocation", i.e.
  // the buyer's entry alone; the facilitator's own require_auth() is
  // satisfied later, at settlement, by the facilitator being the
  // submitting transaction's own source account (no entry needed at
  // all, confirmed for the same contract in `docs/DEFERRED.md`'s Phase 6
  // section), so a real client must drop any non-buyer entry before
  // sending the payload, matching what `UptoStellarScheme._verify`
  // itself already rejects if present
  // (`invalid_upto_stellar_payload_facilitator_in_auth`).
  console.log(
    `Simulator recorded ${recordedAuth.length} auth entr${recordedAuth.length === 1 ? "y" : "ies"}:`,
    recordedAuth.map((entry) => entry.credentials().switch().name)
  );
  console.log(
    "Signing the buyer's auth entry, dropping the facilitator's recorded-but-unsatisfiable one..."
  );
  const buyerEntries = recordedAuth.filter((entry) => {
    const credentials = entry.credentials();
    if (credentials.switch().name !== "sorobanCredentialsAddress") return false;
    const addressCredentials = credentials.address();
    return Address.fromScAddress(addressCredentials.address()).toString() === buyer.publicKey();
  });
  const signedAuthEntries = await Promise.all(
    buyerEntries.map((entry) => authorizeEntry(entry, buyer, deadlineLedger, NETWORK_PASSPHRASE))
  );

  // Rebuilt fresh from the signed entries rather than mutating the
  // `assembleTransaction`-derived `Transaction` object in place (tried
  // first, in an earlier revision of this script): `Transaction.operations`
  // is a derived view over the underlying raw envelope, and mutating the
  // object it returns doesn't feed back into `toXDR()`, silently
  // serializing the original, still-unsigned entries instead. Found by
  // actually running this script and getting a real `UnexpectedType`
  // signature-verification failure on re-simulation, not reasoned about
  // in advance.
  const finalOp = Operation.invokeContractFunction({
    contract: CONTRACT_ID as string,
    function: "settle",
    args: [authorizationScVal, nativeToScVal(clientPlaceholderAmount, { type: "i128" })],
    auth: signedAuthEntries,
  });
  const assembled = new TransactionBuilder(sourceAccount, {
    fee: "10000",
    networkPassphrase: NETWORK_PASSPHRASE,
    sorobanData: simResponse.transactionData.build(),
  })
    .setTimeout(maxTimeoutSeconds)
    .addOperation(finalOp)
    .build();

  const paymentPayload = {
    x402Version: 2,
    accepted: {
      scheme: "upto",
      network: "stellar:testnet" as const,
      asset: ASSET_ADDRESS as string,
      amount: maxAmount.toString(),
      payTo: SELLER_PUBLIC as string,
      maxTimeoutSeconds,
      extra: {
        areFeesSponsored: true,
        uptoProfile: "contract",
        settlementContract: CONTRACT_ID as string,
      },
    },
    payload: {
      transaction: assembled.toXDR(),
      authorization: {
        from: authorizationNative.from,
        to: authorizationNative.to,
        asset: authorizationNative.asset,
        maxAmount: authorizationNative.max_amount.toString(),
        validAfterLedger: authorizationNative.valid_after_ledger,
        deadlineLedger: authorizationNative.deadline_ledger,
        nonce: nonce.toString("hex"),
        facilitator: authorizationNative.facilitator,
      },
    },
  };

  const core = await createFacilitatorCore({
    signers: { "stellar:testnet": FEE_SPONSOR_SECRET as string },
    uptoSettlementContracts: { "stellar:testnet": CONTRACT_ID as string },
  });

  console.log("\nCalling facilitator core.verify() (requirements.amount = maximum)...");
  const verifyRequirements = { ...paymentPayload.accepted, amount: maxAmount.toString() };
  const verifyResult = await core.verify(paymentPayload, verifyRequirements);
  console.log("verify result:", JSON.stringify(verifyResult, null, 2));
  if (!verifyResult.isValid) {
    console.error("Verification failed: aborting before settle().");
    process.exit(1);
  }

  console.log("\nCalling facilitator core.settle() (requirements.amount = actual charge)...");
  const settleRequirements = { ...paymentPayload.accepted, amount: actualAmount.toString() };
  const settleResult = await core.settle(paymentPayload, settleRequirements);
  console.log("settle result:", JSON.stringify(settleResult, null, 2));
  if (!settleResult.success) {
    console.error("Settlement failed.");
    process.exit(1);
  }

  console.log(
    `\nSETTLED on stellar:testnet via this facilitator's own UptoStellarScheme (not the raw contract client): transaction hash: ${settleResult.transaction}`
  );
  console.log(`https://stellar.expert/explorer/testnet/tx/${settleResult.transaction}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
