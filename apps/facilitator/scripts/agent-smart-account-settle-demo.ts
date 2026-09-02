/**
 * Manual/occasional verification tool, NOT part of `pnpm test`: attempts a
 * real, signed `UptoSettlement.settle()` call where `authorization.from` is
 * a Phase 6b `agent-smart-account` (OpenZeppelin `stellar-accounts`,
 * `Signer::Delegated`) instead of a plain G-account buyer, closing the one
 * gap `docs/DEFERRED.md`'s Phase 6b section names as still open.
 *
 * The blocker this script exists to test past: `AssembledTransaction`'s
 * standard discovery flow (`needsNonInvokerSigningBy()`) never surfaces the
 * delegate's own signing requirement for a `Signer::Delegated` smart
 * account, because Soroban's recording-mode simulation never actually
 * invokes `__check_auth`'s body, so a `require_auth_for_args()` call that
 * only happens inside it can't be discovered ahead of time
 * (`OpenZeppelin/stellar-contracts#863`, closing
 * `OpenZeppelin/stellar-contracts#839`). This script hand-constructs both
 * required entries instead of trusting that discovery flow:
 *   1. The smart account's own top-level entry (`SOROBAN_CREDENTIALS_ADDRESS`
 *      or `_V2`, whichever simulation actually returns), signature encoded
 *      as an `AuthPayload` (`context_rule_ids` + a `signers` map with an
 *      empty-bytes entry for the delegate — its real authorization is the
 *      separate entry below, not anything embedded here).
 *   2. A second, entirely separate `SorobanAuthorizationEntry` for the
 *      agent key, whose `rootInvocation` targets the smart account's own
 *      `__check_auth(auth_digest)` — not the top-level `settle` call — with
 *      a fresh nonce, signed with a plain Ed25519 signature over that
 *      entry's own preimage hash.
 * Both pieces (the `auth_digest` formula and the delegate entry's exact
 * shape) are transcribed from `smart-account-kit`'s real, working source
 * (`src/managers/multi-signer-manager.ts`, `src/kit/auth-payload.ts`), the
 * same library whose `Signer::Delegated` repro is the first real,
 * confirmed-on-chain instance of this working
 * (`https://stellar.expert/explorer/testnet/tx/f5835897d8b42544f2c98efbef7110be9d50308717885012b5a6bc9c20644d9f`),
 * not re-derived from scratch a second time.
 *
 * The registered account (`AGENT_SMART_ACCOUNT_TESTNET`) has two
 * `ContextRule`s, id 0 for `UPTO_SETTLEMENT_CONTRACT_TESTNET` and id 1 for
 * `STELLAR_TEST_ASSET_ADDRESS` (`settle()`'s own nested SEP-41 `transfer`
 * needs its own authorized context, per `contracts/agent-smart-account`'s
 * own module doc), so `context_rule_ids` for the top-level entry is `[0,
 * 1]`, one id per `Context` `__check_auth` will receive, in the order the
 * host records them (root call first, its sub-invocation second).
 *
 * Usage (from repo root, after `nvm use 22`):
 *   npx tsx apps/facilitator/scripts/agent-smart-account-settle-demo.ts
 *   (source apps/facilitator/.env into the shell first; this script does
 *   not read --env-file itself, matching every other script here run via
 *   tsx rather than raw node)
 */

import { randomBytes } from "node:crypto";
import {
  Address,
  buildAuthorizationEntryPreimage,
  hash,
  inspectAuthEntry,
  Keypair,
  Operation,
  rpc,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { Client as ContractClient } from "@stellar/stellar-sdk/contract";

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

const FEE_SPONSOR_SECRET = process.env.STELLAR_FEE_SPONSOR_SECRET;
const AGENT_KEY_SECRET = process.env.STELLAR_AGENT_KEY_SECRET;
const SELLER_PUBLIC = process.env.STELLAR_TEST_SELLER_PUBLIC;
const ASSET_ADDRESS = process.env.STELLAR_TEST_ASSET_ADDRESS;
const UPTO_CONTRACT_ID = process.env.UPTO_SETTLEMENT_CONTRACT_TESTNET;
const SMART_ACCOUNT_ID = process.env.AGENT_SMART_ACCOUNT_TESTNET;

const required = {
  STELLAR_FEE_SPONSOR_SECRET: FEE_SPONSOR_SECRET,
  STELLAR_AGENT_KEY_SECRET: AGENT_KEY_SECRET,
  STELLAR_TEST_SELLER_PUBLIC: SELLER_PUBLIC,
  STELLAR_TEST_ASSET_ADDRESS: ASSET_ADDRESS,
  UPTO_SETTLEMENT_CONTRACT_TESTNET: UPTO_CONTRACT_ID,
  AGENT_SMART_ACCOUNT_TESTNET: SMART_ACCOUNT_ID,
};
for (const [name, value] of Object.entries(required)) {
  if (!value) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
}

// --- Transcribed from smart-account-kit's real source, not re-derived ---

function getAddressCredentials(credentials: xdr.SorobanCredentials): xdr.SorobanAddressCredentials {
  switch (credentials.switch().name) {
    case "sorobanCredentialsAddress":
      return credentials.address();
    case "sorobanCredentialsAddressV2":
      return credentials.addressV2();
    default:
      throw new Error(`Unexpected credential type: ${credentials.switch().name}`);
  }
}

function buildAddressSignatureScVal(publicKeyBytes: Buffer, signatureBytes: Buffer): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("public_key"),
        val: xdr.ScVal.scvBytes(publicKeyBytes),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("signature"),
        val: xdr.ScVal.scvBytes(signatureBytes),
      }),
    ]),
  ]);
}

function signerToScVal_Delegated(address: string): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("Delegated"),
    xdr.ScVal.scvAddress(Address.fromString(address).toScAddress()),
  ]);
}

function writeAuthPayload(contextRuleIds: number[], delegateAddress: string): xdr.ScVal {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("context_rule_ids"),
      val: xdr.ScVal.scvVec(contextRuleIds.map((id) => xdr.ScVal.scvU32(id))),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("signers"),
      // Delegated signers contribute empty bytes here; their real
      // authorization is the separate nested entry, not anything in this
      // map (smart-account-kit's multi-signer-manager.ts, same rule).
      val: xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: signerToScVal_Delegated(delegateAddress),
          val: xdr.ScVal.scvBytes(Buffer.alloc(0)),
        }),
      ]),
    }),
  ]);
}

function buildAuthDigest(signaturePayload: Buffer, contextRuleIds: number[]): Buffer {
  const ruleIdsXdr = xdr.ScVal.scvVec(contextRuleIds.map((id) => xdr.ScVal.scvU32(id))).toXDR();
  return hash(Buffer.concat([signaturePayload, ruleIdsXdr]));
}

function randomAuthEntryNonce(): xdr.Int64 {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return xdr.Int64.fromString(new DataView(bytes.buffer).getBigInt64(0, false).toString());
}

// --- End transcribed section ---

async function main(): Promise<void> {
  const server = new rpc.Server(RPC_URL);
  const facilitator = Keypair.fromSecret(FEE_SPONSOR_SECRET as string);
  const agentKey = Keypair.fromSecret(AGENT_KEY_SECRET as string);

  const latestLedger = await server.getLatestLedger();
  const currentLedger = latestLedger.sequence;
  console.log(`Current testnet ledger: ${currentLedger}`);

  const maxAmount = 1_000_000n;
  const actualAmount = 400_000n;
  const validAfterLedger = currentLedger;
  const deadlineLedger = currentLedger + 40;
  const expiration = currentLedger + 100;
  const nonce = randomBytes(32);

  const authorization = {
    from: SMART_ACCOUNT_ID as string,
    to: SELLER_PUBLIC as string,
    asset: ASSET_ADDRESS as string,
    max_amount: maxAmount,
    valid_after_ledger: validAfterLedger,
    deadline_ledger: deadlineLedger,
    nonce,
    facilitator: facilitator.publicKey(),
  };

  console.log("\nAuthorization (what the smart account authorizes):");
  console.log({ ...authorization, nonce: nonce.toString("hex") });

  const client = await ContractClient.from({
    contractId: UPTO_CONTRACT_ID as string,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: facilitator.publicKey(),
    signTransaction: facilitator,
  });

  console.log("\nBuilding and simulating settle() (from = the smart account)...");
  const tx = await (
    client as unknown as {
      settle: (
        args: { authorization: typeof authorization; actual_amount: bigint },
        opts?: Record<string, unknown>
      ) => Promise<any>;
    }
  ).settle({ authorization, actual_amount: actualAmount });

  if ((tx.simulation as any)?.error) {
    console.error("Simulation failed:", (tx.simulation as any).error);
    process.exit(1);
  }

  const builtOp = (tx.built as any).operations[0];
  const simulatedAuthEntries = builtOp.auth as xdr.SorobanAuthorizationEntry[];
  console.log(`\nSimulator recorded ${simulatedAuthEntries.length} auth entries:`);
  for (const entry of simulatedAuthEntries) {
    console.log(`  - ${entry.credentials().switch().name}`);
  }

  // Find the smart account's own entry (its top-level require_auth_for_args
  // for the `settle` call), and pass through anything else untouched
  // (expected: one sourceAccount-type entry for the facilitator, already
  // structurally correct and needing no signature, per the same mechanic
  // upto-settle-demo.ts already documents for the plain-buyer case).
  let smartAccountEntry: xdr.SorobanAuthorizationEntry | undefined;
  const passthroughEntries: xdr.SorobanAuthorizationEntry[] = [];
  for (const entry of simulatedAuthEntries) {
    const credType = entry.credentials().switch().name;
    if (credType === "sorobanCredentialsAddress" || credType === "sorobanCredentialsAddressV2") {
      const addr = Address.fromScAddress(
        getAddressCredentials(entry.credentials()).address()
      ).toString();
      if (addr === SMART_ACCOUNT_ID) {
        smartAccountEntry = entry;
        continue;
      }
    }
    passthroughEntries.push(entry);
  }
  if (!smartAccountEntry) {
    console.error("Simulation did not produce an entry for the smart account's own address.");
    process.exit(1);
  }

  console.log("\nSmart account's own entry (before signing):");
  const info = inspectAuthEntry(smartAccountEntry);
  const inv = info.invocation;
  const rootFn = inv.function().contractFn();
  console.log(
    `  root: contract=${Address.fromScAddress(rootFn.contractAddress()).toString()} fn=${rootFn.functionName()}`
  );
  for (const sub of inv.subInvocations()) {
    const subFn = sub.function().contractFn();
    console.log(
      `  sub: contract=${Address.fromScAddress(subFn.contractAddress()).toString()} fn=${subFn.functionName()}`
    );
  }

  // Two ContextRules: 0 = UptoSettlement (the root call), 1 = the asset (the
  // nested SEP-41 transfer). One id per Context __check_auth will receive,
  // in the order the host records them: root first, its sub-invocation
  // second.
  const contextRuleIds = [0, 1];

  const credentials = getAddressCredentials(smartAccountEntry.credentials());
  credentials.signatureExpirationLedger(expiration);
  const preimage = buildAuthorizationEntryPreimage(
    smartAccountEntry,
    expiration,
    NETWORK_PASSPHRASE
  );
  const signaturePayload = hash(preimage.toXDR());
  const authDigest = buildAuthDigest(signaturePayload, contextRuleIds);

  credentials.signature(writeAuthPayload(contextRuleIds, agentKey.publicKey()));

  // The delegate's own, separate entry: authorizes `__check_auth(auth_digest)`
  // on the smart account, NOT the top-level settle() call. Exact shape from
  // smart-account-kit's multi-signer-manager.ts.
  const delegatedNonce = randomAuthEntryNonce();
  const delegatedInvocation = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: Address.fromString(SMART_ACCOUNT_ID as string).toScAddress(),
        functionName: "__check_auth",
        args: [xdr.ScVal.scvBytes(authDigest)],
      })
    ),
    subInvocations: [],
  });
  const delegatedPreimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({
      networkId: hash(Buffer.from(NETWORK_PASSPHRASE)),
      nonce: delegatedNonce,
      signatureExpirationLedger: expiration,
      invocation: delegatedInvocation,
    })
  );
  const delegatedSignaturePayload = hash(delegatedPreimage.toXDR());
  const delegatedSignatureBytes = agentKey.sign(delegatedSignaturePayload);

  const delegateEntry = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: Address.fromString(agentKey.publicKey()).toScAddress(),
        nonce: delegatedNonce,
        signatureExpirationLedger: expiration,
        signature: buildAddressSignatureScVal(
          Buffer.from(agentKey.rawPublicKey()),
          Buffer.from(delegatedSignatureBytes)
        ),
      })
    ),
    rootInvocation: delegatedInvocation,
  });

  const finalAuthEntries = [smartAccountEntry, delegateEntry, ...passthroughEntries];

  console.log(
    `\nRe-simulating with ${finalAuthEntries.length} auth entries (smart account + delegate + ${passthroughEntries.length} passthrough)...`
  );

  const hostFunc = builtOp.func;
  const facilitatorAccount = await server.getAccount(facilitator.publicKey());
  const resimTx = new TransactionBuilder(facilitatorAccount, {
    fee: "10000000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.invokeHostFunction({ func: hostFunc, auth: finalAuthEntries }))
    .setTimeout(60)
    .build();

  const resimResult = await server.simulateTransaction(resimTx);
  if (rpc.Api.isSimulationError(resimResult)) {
    console.error("Re-simulation failed:", resimResult.error);
    process.exit(1);
  }
  console.log("Re-simulation succeeded — the smart account authorized, no trap.");

  const assembled = rpc.assembleTransaction(resimTx, resimResult).build();
  assembled.sign(facilitator);

  console.log("\nSubmitting (facilitator is transaction source and sponsors the fee)...");
  const sendResult = await server.sendTransaction(assembled);
  if (sendResult.status !== "PENDING") {
    console.error("Submission failed:", sendResult);
    process.exit(1);
  }

  let getResult = await server.getTransaction(sendResult.hash);
  const deadline = Date.now() + 30_000;
  while (getResult.status === rpc.Api.GetTransactionStatus.NOT_FOUND && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    getResult = await server.getTransaction(sendResult.hash);
  }

  console.log(`\nStatus: ${getResult.status}`);
  console.log(`Transaction hash: ${sendResult.hash}`);
  console.log(`https://stellar.expert/explorer/testnet/tx/${sendResult.hash}`);
  if (getResult.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    console.error("Full result:", JSON.stringify(getResult, null, 2));
    process.exit(1);
  }
  console.log(
    "\nSETTLED: the agent-smart-account (Signer::Delegated) authorized a real UptoSettlement.settle() call."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
