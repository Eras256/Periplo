/**
 * Manual/occasional verification tool, NOT part of `pnpm test`: Phase 6b's
 * retry of the OpenZeppelin smart-account scenario with `Signer::External`
 * instead of `Signer::Delegated`. The first attempt (documented in full in
 * `docs/DEFERRED.md`'s Phase 6b section) never got past a
 * `HostError: Error(Auth, InvalidAction)` / `UnreachableCodeReached` trap
 * inside `__check_auth`, isolated down to something about `Signer::Delegated`
 * itself (identical trap against a trivial probe contract, identical trap
 * with the SDK version aligned to the target contract's own line). Reviewing
 * `stellar_accounts::smart_account::storage::authenticate`'s two arms side
 * by side is what motivated this retry: `External` verifies a raw Ed25519
 * signature via one cross-contract call to a deployed `Verifier`
 * (`contracts/agent-verifier`), entirely inside this account's own single
 * `SorobanAuthorizationEntry`: no second, hand-constructed nested entry.
 *
 * `contracts/agent-smart-account` (redeployed for this retry) now installs
 * TWO context rules, not one: `settle()` pulls the buyer's funds with a
 * direct SEP-41 `transfer`, which is its own `Context` requiring its own
 * matching rule (see that crate's module doc). This script signs the ONE
 * auth entry the smart account needs, covering BOTH contexts via
 * `AuthPayload.context_rule_ids` aligned by index to the entry's own
 * root call + sub-invocation.
 *
 * Usage (from repo root, after `nvm use 22`):
 *   node --env-file=.env apps/facilitator/scripts/upto-external-signer-demo.ts
 */

import { randomBytes } from "node:crypto";
import {
  authorizeEntry,
  hash,
  Keypair,
  nativeToScVal,
  rpc,
  Address as SdkAddress,
  xdr,
} from "@stellar/stellar-sdk";
import { Client as ContractClient } from "@stellar/stellar-sdk/contract";

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

const FEE_SPONSOR_SECRET = process.env.STELLAR_FEE_SPONSOR_SECRET;
const BUYER_SECRET = process.env.STELLAR_TEST_BUYER_SECRET; // used only to fund the smart account
const AGENT_SECRET = process.env.STELLAR_AGENT_KEY_SECRET; // raw Ed25519 keypair, the External signer
const SELLER_PUBLIC = process.env.STELLAR_TEST_SELLER_PUBLIC;
const ASSET_ADDRESS = process.env.STELLAR_TEST_ASSET_ADDRESS;
const UPTO_SETTLEMENT_ID = "CDJY6YLHORR5WYCJM5OQZQZ5SBGBMFZZFRHSIMKEQ2N2KNX237K2B42Q"; // Phase 6b instance
const SMART_ACCOUNT_ID = "CA3LQLUJWT3GIRIGFIRKLO73CLLOWY7TKTFFOB5VCSYHARGHNVEPSZEB"; // External-signer retry

const SETTLE_RULE_ID = 0;
const TRANSFER_RULE_ID = 1;

if (!FEE_SPONSOR_SECRET || !BUYER_SECRET || !AGENT_SECRET || !SELLER_PUBLIC || !ASSET_ADDRESS) {
  console.error(
    "Missing one of: STELLAR_FEE_SPONSOR_SECRET, STELLAR_TEST_BUYER_SECRET, " +
      "STELLAR_AGENT_KEY_SECRET, STELLAR_TEST_SELLER_PUBLIC, STELLAR_TEST_ASSET_ADDRESS"
  );
  process.exit(1);
}

async function getBalance(
  facilitator: Keypair,
  contractId: string,
  account: string
): Promise<bigint> {
  const tokenClient = await ContractClient.from({
    contractId,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: facilitator.publicKey(),
    signTransaction: facilitator,
  });
  const result = await (
    tokenClient as unknown as {
      balance: (args: { id: string }, opts?: Record<string, unknown>) => Promise<any>;
    }
  ).balance({ id: account });
  return BigInt(result.result ?? result);
}

async function fundSmartAccount(server: rpc.Server, buyer: Keypair, amount: bigint): Promise<void> {
  console.log(`\nFunding the smart account with ${amount} of the test asset (from the buyer)...`);
  const tokenClient = await ContractClient.from({
    contractId: ASSET_ADDRESS as string,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: buyer.publicKey(),
    signTransaction: buyer,
  });
  const tx = await (
    tokenClient as unknown as {
      transfer: (
        args: { from: string; to: string; amount: bigint },
        opts?: Record<string, unknown>
      ) => Promise<any>;
    }
  ).transfer({ from: buyer.publicKey(), to: SMART_ACCOUNT_ID, amount });
  if (tx.simulation?.error) {
    throw new Error(`funding simulation failed: ${JSON.stringify(tx.simulation.error)}`);
  }
  const sent = await tx.signAndSend();
  const fundHash =
    sent.sendTransactionResponse?.hash ?? (sent as any).getTransactionResponse?.txHash;
  console.log(`Funded. tx: ${fundHash}`);
}

async function main(): Promise<void> {
  const server = new rpc.Server(RPC_URL);
  const facilitator = Keypair.fromSecret(FEE_SPONSOR_SECRET as string);
  const buyer = Keypair.fromSecret(BUYER_SECRET as string);
  const agent = Keypair.fromSecret(AGENT_SECRET as string);

  const latestLedger = await server.getLatestLedger();
  const currentLedger = latestLedger.sequence;
  console.log(`Current testnet ledger: ${currentLedger}`);

  const maxAmount = 500_000n;
  const actualAmount = 200_000n;
  const validAfterLedger = currentLedger;
  const deadlineLedger = currentLedger + 30;
  const expirationLedger = currentLedger + 20;
  const nonce = randomBytes(32);

  const smartAccountBalanceBefore = await getBalance(
    facilitator,
    ASSET_ADDRESS as string,
    SMART_ACCOUNT_ID
  );
  console.log(`Smart account balance before: ${smartAccountBalanceBefore}`);
  if (smartAccountBalanceBefore < maxAmount) {
    await fundSmartAccount(server, buyer, maxAmount * 2n);
  }

  const authorization = {
    from: SMART_ACCOUNT_ID,
    to: SELLER_PUBLIC as string,
    asset: ASSET_ADDRESS as string,
    max_amount: maxAmount,
    valid_after_ledger: validAfterLedger,
    deadline_ledger: deadlineLedger,
    nonce,
    facilitator: facilitator.publicKey(),
  };

  console.log("\nAuthorization (what the smart account signs):");
  console.log({ ...authorization, nonce: nonce.toString("hex") });

  const settlementClient = await ContractClient.from({
    contractId: UPTO_SETTLEMENT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: facilitator.publicKey(),
    signTransaction: facilitator,
  });

  console.log("\nBuilding and simulating settle()...");
  const tx = await (
    settlementClient as unknown as {
      settle: (
        args: { authorization: typeof authorization; actual_amount: bigint },
        opts?: Record<string, unknown>
      ) => Promise<any>;
    }
  ).settle({ authorization, actual_amount: actualAmount });

  if (tx.simulation?.error) {
    console.error("Simulation failed:", tx.simulation.error);
    process.exit(1);
  }

  const builtOp = (tx.built as any).operations[0];
  const authEntries: xdr.SorobanAuthorizationEntry[] = builtOp.auth ?? [];
  console.log(`\nAuth entries required: ${authEntries.length}`);

  const smartAccountAddress = SdkAddress.fromString(SMART_ACCOUNT_ID);
  const smartAccountEntry = authEntries.find((entry) => {
    const creds = entry.credentials();
    if (creds.switch().name !== "sorobanCredentialsAddress") return false;
    return SdkAddress.fromScAddress(creds.address().address()).toString() === SMART_ACCOUNT_ID;
  });
  if (!smartAccountEntry) {
    throw new Error("no auth entry found for the smart account, unexpected");
  }
  const rootInvocation = smartAccountEntry.rootInvocation();
  const subInvocations = rootInvocation.subInvocations();
  console.log(`Smart account's own entry: root call + ${subInvocations.length} sub-invocation(s)`);
  console.log(
    `  root: ${rootInvocation.function().contractFn().functionName()}, ` +
      `subs: ${subInvocations.map((s) => s.function().contractFn().functionName()).join(", ")}`
  );

  // Fetch the smart account's own ContractSpec, live, to encode AuthPayload
  // and Signer correctly, no hand-built XDR, no generated bindings checked
  // into the repo.
  const smartAccountClient = await ContractClient.from({
    contractId: SMART_ACCOUNT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: facilitator.publicKey(),
    signTransaction: facilitator,
  });
  const spec = (smartAccountClient as any).spec;

  console.log(
    "\nSigning the smart account's single auth entry (Signer::External, one cross-contract verify call)..."
  );
  const authorizedEntry = await authorizeEntry(
    smartAccountEntry,
    (preimage) => {
      const signaturePayload = hash(preimage.toXDR());
      // context_rule_ids aligned by index to [root call, sub-invocation]:
      // 0 = upto-settlement-only (the settle() call itself),
      // 1 = asset-transfer-only (the nested SEP-41 pull).
      const ruleIds = nativeToScVal([SETTLE_RULE_ID, TRANSFER_RULE_ID], { type: "u32" });
      const authDigest = hash(Buffer.concat([signaturePayload, ruleIds.toXDR()]));
      const rawSignature = agent.sign(authDigest);

      const signerScVal = spec.nativeToUdt(
        { tag: "External", values: [SMART_ACCOUNT_VERIFIER, agent.rawPublicKey()] },
        "Signer"
      );
      const signersMap = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: signerScVal, val: xdr.ScVal.scvBytes(rawSignature) }),
      ]);
      const signatureScVal = spec.nativeToUdt(
        { signers: signersMap, context_rule_ids: [SETTLE_RULE_ID, TRANSFER_RULE_ID] },
        "AuthPayload"
      );
      return { signatureScVal };
    },
    expirationLedger,
    NETWORK_PASSPHRASE
  );

  const otherEntries = authEntries.filter((e) => e !== smartAccountEntry);
  builtOp.auth = [authorizedEntry, ...otherEntries];

  console.log("\nSubmitting (facilitator is transaction source and sponsors the fee)...");
  const sent = await tx.signAndSend();
  const settleHash =
    sent.sendTransactionResponse?.hash ?? (sent as any).getTransactionResponse?.txHash;
  console.log(`\nSETTLED on stellar:testnet: transaction hash: ${settleHash}`);
  console.log(`https://stellar.expert/explorer/testnet/tx/${settleHash}`);

  console.log("\n=== Verifying against real contract state ===");
  const smartAccountBalanceAfter = await getBalance(
    facilitator,
    ASSET_ADDRESS as string,
    SMART_ACCOUNT_ID
  );
  const sellerBalanceAfter = await getBalance(
    facilitator,
    ASSET_ADDRESS as string,
    SELLER_PUBLIC as string
  );
  console.log(`Smart account balance after: ${smartAccountBalanceAfter}`);
  console.log(`Seller balance after: ${sellerBalanceAfter}`);
}

const SMART_ACCOUNT_VERIFIER = "CAG4XLOGOBQUKRV4QESCYDJHY5IPTINTC64XDXF5EHA5GXACVVRA6TU3";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
