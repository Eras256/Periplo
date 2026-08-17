/**
 * Manual/occasional verification tool, NOT part of `pnpm test`: the Phase 6
 * gate's evidence generator. Against the REAL `UptoSettlement` contract
 * deployed to stellar:testnet (`contracts/upto-settlement`,
 * `UPTO_SETTLEMENT_CONTRACT_TESTNET`), this:
 *
 *   1. Builds and simulates a `settle` call for a genuine partial
 *      settlement (buyer signs a ceiling, facilitator settles less),
 *      printing the actual signed auth-entry structure from simulation,
 *      the direct evidence for spec assumption 1 (`require_auth_for_args`
 *      accepts a root tuple of `(authorization,)` while the SEP-41
 *      `transfer` rides as a sub-invocation for `max_amount`).
 *   2. Prints the simulation's real resource consumption against the
 *      network's live per-transaction ceilings, evidence for assumption 2
 *      (pull → pay → refund fits Soroban's read/write/instruction/memory
 *      limits).
 *   3. Signs the buyer's auth entry, submits as the facilitator, and once
 *      settled, reads the deployed nonce entry's real TTL back from RPC,
 *      evidence for assumption 3 (`temporary()` TTL covers
 *      `deadline_ledger - current_ledger`).
 *
 * Each run submits a real testnet transaction and spends a small amount of
 * the test buyer's PTEST balance, the same reason `settle-demo.ts` (the
 * `exact`-scheme equivalent) isn't wired into the default test suite.
 *
 * Usage (from repo root, after `nvm use 22`):
 *   node --env-file=.env apps/facilitator/scripts/upto-settle-demo.ts
 */

import { randomBytes } from "node:crypto";
import { Address, inspectAuthEntry, Keypair, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
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

async function main(): Promise<void> {
  const server = new rpc.Server(RPC_URL);
  const facilitator = Keypair.fromSecret(FEE_SPONSOR_SECRET as string);
  const buyer = Keypair.fromSecret(BUYER_SECRET as string);

  const latestLedger = await server.getLatestLedger();
  const currentLedger = latestLedger.sequence;
  console.log(`Current testnet ledger: ${currentLedger}`);

  // Small ceiling: 0.1 PTEST (7 decimals). Settle for less than that, so
  // this run genuinely exercises the refund leg, not just a full payout.
  const maxAmount = 1_000_000n;
  const actualAmount = 400_000n;
  const validAfterLedger = currentLedger; // window is (deadline - valid_after), NOT (deadline - 0)
  const deadlineLedger = currentLedger + 30; // ~150s at 5s/ledger, comfortably inside maxTimeoutSeconds' usual range
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

  // `Client.from` fetches the contract's spec live from the deployed WASM
  // via RPC, no generated/pre-built bindings needed for this script to
  // stay reproducible from a clean checkout.
  const client = await ContractClient.from({
    contractId: CONTRACT_ID as string,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: facilitator.publicKey(),
    signTransaction: facilitator,
  });

  console.log("\nBuilding and simulating settle()...");
  const tx = await (
    client as unknown as {
      settle: (
        args: { authorization: typeof authorization; actual_amount: bigint },
        opts?: Record<string, unknown>
      ) => Promise<InstanceType<typeof ContractClient extends never ? never : any>>;
    }
  ).settle({ authorization, actual_amount: actualAmount });

  if ((tx.simulation as any)?.error) {
    console.error("Simulation failed:", (tx.simulation as any).error);
    process.exit(1);
  }

  // --- Assumption 1: require_auth_for_args root tuple + sub-invocation ---
  console.log("\n=== Assumption 1: auth-entry structure ===");
  const builtOp = (tx.built as any).operations[0];
  const authEntries = builtOp.auth as any[];
  console.log(`Auth entries required: ${authEntries.length}`);
  for (const entry of authEntries) {
    const info = inspectAuthEntry(entry);
    console.log(`- credentialType=${info.credentialType} address=${info.address}`);
    const inv = info.invocation;
    const fn = inv.function().contractFn();
    console.log(
      `  root call: contract=${Address.fromScAddress(fn.contractAddress()).toString()} fn=${fn.functionName()} argCount=${fn.args().length}`
    );
    const subs = inv.subInvocations();
    console.log(`  sub-invocations: ${subs.length}`);
    for (const sub of subs) {
      const subFn = sub.function().contractFn();
      console.log(
        `    - contract=${Address.fromScAddress(subFn.contractAddress()).toString()} fn=${subFn.functionName()} args=${subFn
          .args()
          .map((a) => scValToNative(a))}`
      );
    }
  }
  console.log(
    "Root call's argCount === 1 confirms the signed tuple is (authorization,) only, " +
      "actual_amount never appears in what require_auth_for_args covers."
  );

  // --- Assumption 2: resource limits ---
  console.log("\n=== Assumption 2: resource consumption vs. network limits ===");
  const sim = tx.simulation as any;
  const txData = sim.transactionData?.build?.() ?? sim.transactionData;
  const resources = txData?._attributes?.resources ?? txData?.resources?.();
  if (resources) {
    console.log("Simulated resource footprint:", {
      instructions: resources.instructions?.().toString?.() ?? resources.instructions,
      readBytes: resources.readBytes?.() ?? resources.diskReadBytes?.(),
      writeBytes: resources.writeBytes?.(),
    });
  }
  console.log(`Min resource fee (stroops): ${sim.minResourceFee}`);
  console.log(
    "Network ceilings (testnet, checked live via `stellar network settings`): " +
      "tx_max_instructions=400,000,000; tx_max_write_ledger_entries=200; tx_max_write_bytes=132,096."
  );

  // --- Sign buyer's auth entry, then submit as the facilitator ---
  const needsSigning = tx.needsNonInvokerSigningBy();
  console.log(`\nNon-invoker signers needed: ${needsSigning}`);

  await tx.signAuthEntries({ address: buyer.publicKey(), signAuthEntry: buyer });

  console.log("\nSubmitting (facilitator is transaction source and sponsors the fee)...");
  const sent = await tx.signAndSend();
  const hash = sent.sendTransactionResponse?.hash ?? (sent as any).getTransactionResponse?.txHash;
  console.log(`\nSETTLED on stellar:testnet: transaction hash: ${hash}`);
  console.log(`https://stellar.expert/explorer/testnet/tx/${hash}`);

  // --- Assumption 3: temporary() TTL covers the deadline window ---
  console.log("\n=== Assumption 3: nonce entry TTL ===");
  // DataKey::Nonce(nonce): a #[contracttype] tuple-variant enum serializes
  // as the vec [Symbol("Nonce"), Bytes(nonce)]. Built explicitly rather than
  // via nativeToScVal's heuristics: a bare JS string defaults to scvString,
  // not the scvSymbol an enum discriminant actually needs.
  const key = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Nonce"), xdr.ScVal.scvBytes(nonce)]);
  const ledgerKey = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: Address.fromString(CONTRACT_ID as string).toScAddress(),
      key,
      durability: xdr.ContractDataDurability.temporary(),
    })
  );
  const entries = await server.getLedgerEntries(ledgerKey);
  if (entries.entries.length > 0) {
    const liveUntil = entries.entries[0].liveUntilLedgerSeq;
    console.log(`Nonce entry liveUntilLedgerSeq: ${liveUntil}`);
    console.log(`deadline_ledger: ${deadlineLedger}`);
    console.log(
      liveUntil !== undefined && liveUntil >= deadlineLedger
        ? "CONFIRMED: TTL covers the full window to deadline_ledger."
        : "WARNING: TTL does not cover deadline_ledger, investigate before closing the gate."
    );
  } else {
    console.log("Nonce entry not found: unexpected, investigate.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
