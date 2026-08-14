/**
 * Manual/occasional verification tool, NOT part of `pnpm test` — Phase 6b's
 * zero-settlement evidence generator. Against the REAL `UptoSettlement`
 * contract already deployed to stellar:testnet for Phase 6
 * (`UPTO_SETTLEMENT_CONTRACT_TESTNET`, unchanged by Phase 6b), this proves
 * the `actual_amount === 0` path with a genuine transaction, not just the
 * unit test (`zero_settlement_refunds_everything` in `src/test.rs`):
 *
 *   1. The full `max_amount` ceiling is refunded to the buyer (net spend:
 *      zero, beyond the network fee).
 *   2. The seller's balance is unchanged by this transaction.
 *   3. The authorization's nonce is consumed regardless: a second `settle`
 *      call reusing the same nonce is rejected as `AuthorizationConsumed`
 *      (checked live, not inferred from the code).
 *
 * Same spend/caution profile as `settle-demo.ts` and `upto-settle-demo.ts`:
 * submits two real testnet transactions (the zero-settlement itself, then
 * the deliberate replay attempt) and spends a small amount of network fee,
 * not test-asset balance (the whole ceiling comes back).
 *
 * Usage (from repo root, after `nvm use 22`):
 *   node --env-file=.env apps/facilitator/scripts/upto-settle-zero-demo.ts
 */

import { randomBytes } from "node:crypto";
import { Keypair, rpc } from "@stellar/stellar-sdk";
import { Client as ContractClient } from "@stellar/stellar-sdk/contract";

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

const FEE_SPONSOR_SECRET = process.env.STELLAR_FEE_SPONSOR_SECRET;
const BUYER_SECRET = process.env.STELLAR_TEST_BUYER_SECRET;
const SELLER_PUBLIC = process.env.STELLAR_TEST_SELLER_PUBLIC;
const ASSET_ADDRESS = process.env.STELLAR_TEST_ASSET_ADDRESS;
const CONTRACT_ID = process.env.UPTO_SETTLEMENT_CONTRACT_TESTNET;

if (!FEE_SPONSOR_SECRET || !BUYER_SECRET || !SELLER_PUBLIC || !ASSET_ADDRESS || !CONTRACT_ID) {
  console.error(
    "Missing one of: STELLAR_FEE_SPONSOR_SECRET, STELLAR_TEST_BUYER_SECRET, " +
      "STELLAR_TEST_SELLER_PUBLIC, STELLAR_TEST_ASSET_ADDRESS, UPTO_SETTLEMENT_CONTRACT_TESTNET"
  );
  process.exit(1);
}

async function getBalance(facilitator: Keypair, contractId: string, account: string): Promise<bigint> {
  // Read-only: build against the token's own real spec (same Client.from
  // pattern used against UptoSettlement elsewhere in this repo) and call
  // balance() via simulation only, never signed or submitted.
  const tokenClient = await ContractClient.from({
    contractId,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: facilitator.publicKey(),
    signTransaction: facilitator,
  });
  const result = await (
    tokenClient as unknown as { balance: (args: { id: string }, opts?: Record<string, unknown>) => Promise<any> }
  ).balance({ id: account });
  return BigInt(result.result ?? result);
}

async function buildAndSettle(
  server: rpc.Server,
  facilitator: Keypair,
  buyer: Keypair,
  authorization: Record<string, unknown>,
  actualAmount: bigint
) {
  const client = await ContractClient.from({
    contractId: CONTRACT_ID as string,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: facilitator.publicKey(),
    signTransaction: facilitator,
  });

  const tx = await (
    client as unknown as {
      settle: (
        args: { authorization: typeof authorization; actual_amount: bigint },
        opts?: Record<string, unknown>
      ) => Promise<any>;
    }
  ).settle({ authorization, actual_amount: actualAmount });

  return tx;
}

async function main(): Promise<void> {
  const server = new rpc.Server(RPC_URL);
  const facilitator = Keypair.fromSecret(FEE_SPONSOR_SECRET as string);
  const buyer = Keypair.fromSecret(BUYER_SECRET as string);

  const latestLedger = await server.getLatestLedger();
  const currentLedger = latestLedger.sequence;
  console.log(`Current testnet ledger: ${currentLedger}`);

  const maxAmount = 500_000n; // 0.05 PTEST ceiling — all of it should come back
  const actualAmount = 0n;
  const validAfterLedger = currentLedger;
  const deadlineLedger = currentLedger + 30;
  const nonce = randomBytes(32);

  const authorization = {
    from: buyer.publicKey(),
    to: SELLER_PUBLIC as string,
    asset: ASSET_ADDRESS as string,
    max_amount: maxAmount,
    valid_after_ledger: validAfterLedger,
    deadline_ledger: deadlineLedger,
    nonce,
    facilitator: facilitator.publicKey(),
  };

  console.log("\nAuthorization (what the buyer signs):");
  console.log({ ...authorization, nonce: nonce.toString("hex") });
  console.log(`\nSettling with actual_amount = 0 (zero-settlement: full refund, no charge).`);

  const buyerBalanceBefore = await getBalance(facilitator, ASSET_ADDRESS as string, buyer.publicKey());
  const sellerBalanceBefore = await getBalance(facilitator, ASSET_ADDRESS as string, SELLER_PUBLIC as string);

  const tx = await buildAndSettle(server, facilitator, buyer, authorization, actualAmount);
  if ((tx.simulation as any)?.error) {
    console.error("Simulation failed:", (tx.simulation as any).error);
    process.exit(1);
  }

  await tx.signAuthEntries({ address: buyer.publicKey(), signAuthEntry: buyer });

  console.log("\nSubmitting zero-settlement (facilitator is transaction source and sponsors the fee)...");
  const sent = await tx.signAndSend();
  const hash = sent.sendTransactionResponse?.hash ?? (sent as any).getTransactionResponse?.txHash;
  console.log(`\nSETTLED (zero) on stellar:testnet — transaction hash: ${hash}`);
  console.log(`https://stellar.expert/explorer/testnet/tx/${hash}`);

  console.log("\n=== Verifying balances against real contract state (not just the printed result) ===");
  const buyerBalanceAfter = await getBalance(facilitator, ASSET_ADDRESS as string, buyer.publicKey());
  const sellerBalanceAfter = await getBalance(facilitator, ASSET_ADDRESS as string, SELLER_PUBLIC as string);
  console.log(`Buyer balance before: ${buyerBalanceBefore}, after: ${buyerBalanceAfter}`);
  console.log(`Seller balance before: ${sellerBalanceBefore}, after: ${sellerBalanceAfter}`);
  console.log(
    buyerBalanceAfter === buyerBalanceBefore
      ? "CONFIRMED: buyer balance unchanged, the full ceiling was refunded."
      : "WARNING: buyer balance changed — investigate before closing the gate."
  );
  console.log(
    sellerBalanceAfter === sellerBalanceBefore
      ? "CONFIRMED: seller balance unchanged, zero actually charged."
      : "WARNING: seller balance changed on a zero-settlement — investigate."
  );

  console.log("\n=== Confirming the nonce is consumed even at actual_amount = 0 ===");
  console.log("Attempting a replay with the same authorization (expect AuthorizationConsumed)...");
  try {
    const replayTx = await buildAndSettle(server, facilitator, buyer, authorization, actualAmount);
    if ((replayTx.simulation as any)?.error) {
      const errText = JSON.stringify((replayTx.simulation as any).error);
      console.log(`Replay simulation rejected: ${errText}`);
      console.log(
        errText.includes("Error(Contract, #6)") || errText.toLowerCase().includes("authorizationconsumed")
          ? "CONFIRMED: nonce was consumed by the zero-settlement, replay rejected as AuthorizationConsumed (error code 6)."
          : "WARNING: replay was rejected but not clearly for AuthorizationConsumed — inspect the error above."
      );
    } else {
      console.log("WARNING: replay simulation did not fail — nonce reuse was not rejected. Investigate before closing the gate.");
    }
  } catch (error) {
    console.log(`Replay attempt threw: ${(error as Error).message}`);
    console.log(
      (error as Error).message.includes("#6") || (error as Error).message.toLowerCase().includes("authorizationconsumed")
        ? "CONFIRMED: nonce was consumed by the zero-settlement, replay rejected as AuthorizationConsumed (error code 6)."
        : "WARNING: replay was rejected but the reason does not clearly say AuthorizationConsumed — inspect the message above."
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
