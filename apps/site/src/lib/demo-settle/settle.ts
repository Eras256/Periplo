import { randomBytes } from "node:crypto";
import {
  Account,
  Address,
  authorizeEntry,
  Horizon,
  Keypair,
  Networks,
  nativeToScVal,
  Operation,
  rpc,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { UPTO_CONTRACT_ID, USDC_CONTRACT_ID } from "../../demo/contract";
import { computeCharge, type SettleRequest, type SettleSuccess } from "../../demo/settle-model";
import { decodeSettledEvent } from "../../demo/settled-event";
import type { RecentSettlement } from "./limits";

export const RPC_URL = "https://soroban-testnet.stellar.org";
export const HORIZON_URL = "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE = Networks.TESTNET;
/** Same ceiling the facilitator uses for Soroban fees (`MAX_TRANSACTION_FEE_STROOPS`). */
const MAX_FEE_STROOPS = 200_000;
const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
/** The fixture buyer holds hundreds of testnet USDC; the demo must never sign with it. */
const FIXTURE_BUYER = "GA3CTEOWYFXEHDJZYMCXKQIVOQ2NK4MHTPKWKJVAEEOG3LWBKN2EUSYP";
/** A demo buyer holding more than this is misconfigured: the account is meant to carry a few USDC. */
const MAX_BUYER_BALANCE = 50n * 10_000_000n;
const AUTH_WINDOW_LEDGERS = 40;
const SETTLED_TOPIC = "AAAADwAAAAdzZXR0bGVkAA==";

/** Carries a stable code the route maps to an HTTP status; never a secret, never SDK internals. */
export class DemoSettleError extends Error {
  constructor(
    readonly code: "demo_unavailable" | "demo_unfunded" | "unconfirmed" | "failed",
    readonly detail: string,
    readonly hash?: string
  ) {
    super(code);
  }
}

export interface DemoConfig {
  readonly buyer: Keypair;
  readonly submitter: Keypair;
  readonly seller: string;
}

/** Reads the three accounts from the environment; every failure is the same non-revealing error. */
export function loadConfig(env: Record<string, string | undefined>): DemoConfig {
  try {
    const buyer = Keypair.fromSecret((env.DEMO_BUYER_SECRET ?? "").trim());
    const submitter = Keypair.fromSecret((env.DEMO_SUBMITTER_SECRET ?? "").trim());
    const seller = (env.DEMO_SELLER_PUBLIC ?? "").trim();
    Keypair.fromPublicKey(seller);
    return { buyer, submitter, seller };
  } catch {
    throw new DemoSettleError("demo_unavailable", "config");
  }
}

interface AccountView {
  readonly balances: readonly {
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
    balance: string;
  }[];
  readonly signers: readonly { key: string }[];
}

const horizon = () => new Horizon.Server(HORIZON_URL);

function unitsOf(balance: string): bigint {
  const [whole = "0", fraction = ""] = balance.split(".");
  return BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0").slice(0, 7));
}

let bootCheckedAt = 0;
const BOOT_CHECK_TTL_MS = 5 * 60 * 1000;

/**
 * Non-custodial check, run on a cold start and then every five minutes: the account
 * that submits and pays fees must hold XLM only and be signed only by itself, and it
 * must be neither the buyer nor the seller. The buyer must be a dedicated small account.
 */
export async function assertNonCustodial(config: DemoConfig, now = Date.now()): Promise<bigint> {
  const submitterId = config.submitter.publicKey();
  const buyerId = config.buyer.publicKey();
  if (
    submitterId === buyerId ||
    submitterId === config.seller ||
    buyerId === config.seller ||
    buyerId === FIXTURE_BUYER
  ) {
    throw new DemoSettleError("demo_unavailable", "accounts_not_distinct");
  }
  const [buyerAccount, submitterAccount] = await Promise.all([
    horizon().accounts().accountId(buyerId).call() as Promise<AccountView>,
    now - bootCheckedAt < BOOT_CHECK_TTL_MS
      ? Promise.resolve(null)
      : (horizon().accounts().accountId(submitterId).call() as Promise<AccountView>),
  ]);
  if (submitterAccount) {
    const holdsAssets = submitterAccount.balances.some((line) => line.asset_type !== "native");
    const foreignSigner = submitterAccount.signers.some((signer) => signer.key !== submitterId);
    if (holdsAssets || foreignSigner) {
      throw new DemoSettleError("demo_unavailable", "submitter_not_xlm_only");
    }
    bootCheckedAt = now;
  }
  const usdc = buyerAccount.balances.find(
    (line) => line.asset_code === "USDC" && line.asset_issuer === USDC_ISSUER
  );
  const balance = usdc ? unitsOf(usdc.balance) : 0n;
  if (balance > MAX_BUYER_BALANCE)
    throw new DemoSettleError("demo_unavailable", "buyer_overfunded");
  return balance;
}

/** Transactions the submitter already made in the last day, newest first (one Horizon page). */
export async function fetchRecentSettlements(config: DemoConfig): Promise<RecentSettlement[]> {
  const page = await horizon()
    .transactions()
    .forAccount(config.submitter.publicKey())
    .order("desc")
    .limit(200)
    .includeFailed(true)
    .call();
  return page.records.map((record) => ({
    hash: record.hash,
    createdAt: Date.parse(record.created_at),
    visitorTag: tagFromEnvelope(record.envelope_xdr),
  }));
}

/** Reads the visitor tag back out of a settle transaction: the first 16 bytes of the signed nonce. */
export function tagFromEnvelope(envelopeXdr: string): string | null {
  try {
    const envelope = xdr.TransactionEnvelope.fromXDR(envelopeXdr, "base64");
    const operation = envelope.v1().tx().operations()[0]?.body().invokeHostFunctionOp();
    const args = operation?.hostFunction().invokeContract().args();
    const fields = args?.[0]?.map();
    const nonce = fields
      ?.find((entry) => entry.key().sym().toString() === "nonce")
      ?.val()
      .bytes();
    return nonce && nonce.length === 32 ? nonce.subarray(0, 16).toString("hex") : null;
  } catch {
    return null;
  }
}

/** The struct the buyer signs: a Soroban `contracttype` struct is an ScMap with symbol keys in sorted order. */
export function authorizationScVal(fields: {
  readonly from: string;
  readonly to: string;
  readonly asset: string;
  readonly maxAmount: bigint;
  readonly validAfterLedger: number;
  readonly deadlineLedger: number;
  readonly nonce: Buffer;
  readonly facilitator: string;
}): xdr.ScVal {
  const entries: [string, xdr.ScVal][] = [
    ["asset", new Address(fields.asset).toScVal()],
    ["deadline_ledger", nativeToScVal(fields.deadlineLedger, { type: "u32" })],
    ["facilitator", new Address(fields.facilitator).toScVal()],
    ["from", new Address(fields.from).toScVal()],
    ["max_amount", nativeToScVal(fields.maxAmount, { type: "i128" })],
    ["nonce", xdr.ScVal.scvBytes(fields.nonce)],
    ["to", new Address(fields.to).toScVal()],
    ["valid_after_ledger", nativeToScVal(fields.validAfterLedger, { type: "u32" })],
  ];
  return xdr.ScVal.scvMap(
    entries.map(([key, val]) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val }))
  );
}

function assertOperationOk(response: rpc.Api.SendTransactionResponse): boolean {
  return response.status === "PENDING" || response.status === "DUPLICATE";
}

function isBadSequence(response: rpc.Api.SendTransactionResponse): boolean {
  try {
    return response.errorResult?.result().switch().name === "txBadSeq";
  } catch {
    return false;
  }
}

async function buildSignedSettlement(
  server: rpc.Server,
  config: DemoConfig,
  request: SettleRequest,
  actual: bigint,
  tag: string
) {
  const latest = await server.getLatestLedger();
  const validUntil = latest.sequence + AUTH_WINDOW_LEDGERS;
  const source = await server.getAccount(config.submitter.publicKey());
  const sequence = source.sequenceNumber();
  const authorization = authorizationScVal({
    from: config.buyer.publicKey(),
    to: config.seller,
    asset: USDC_CONTRACT_ID,
    maxAmount: request.ceiling,
    validAfterLedger: latest.sequence,
    deadlineLedger: validUntil,
    nonce: Buffer.concat([Buffer.from(tag, "hex"), randomBytes(16)]),
    facilitator: config.submitter.publicKey(),
  });
  // `build()` advances the account's sequence, so every build starts from a fresh Account.
  const buildWith = (auth: xdr.SorobanAuthorizationEntry[]) =>
    new TransactionBuilder(new Account(config.submitter.publicKey(), sequence), {
      fee: "100",
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.invokeHostFunction({
          func: xdr.HostFunction.hostFunctionTypeInvokeContract(
            new xdr.InvokeContractArgs({
              contractAddress: new Address(UPTO_CONTRACT_ID).toScAddress(),
              functionName: "settle",
              args: [authorization, nativeToScVal(actual, { type: "i128" })],
            })
          ),
          auth,
        })
      )
      .setTimeout(60)
      .build();

  // Recording simulation discovers the buyer's authorization entry; the buyer signs only that entry.
  const first = await server.simulateTransaction(buildWith([]));
  if (rpc.Api.isSimulationError(first) || !first.result) {
    throw new DemoSettleError(
      "failed",
      `simulation_rejected:${rpc.Api.isSimulationError(first) ? first.error.slice(0, 300) : "no_result"}`
    );
  }
  const signedAuth = await Promise.all(
    first.result.auth.map(async (entry) => {
      const credentials = entry.credentials();
      if (credentials.switch() !== xdr.SorobanCredentialsType.sorobanCredentialsAddress())
        return entry;
      const signer = Address.fromScAddress(credentials.address().address()).toString();
      if (signer !== config.buyer.publicKey()) return entry;
      return authorizeEntry(entry, config.buyer, validUntil, NETWORK_PASSPHRASE);
    })
  );

  // Re-simulate with the signed entries so the resource footprint matches what is submitted.
  const withAuth = buildWith(signedAuth);
  const second = await server.simulateTransaction(withAuth);
  if (rpc.Api.isSimulationError(second)) throw new DemoSettleError("failed", "simulation_rejected");
  const assembled = rpc.assembleTransaction(withAuth, second).build();
  if (Number(assembled.fee) > MAX_FEE_STROOPS)
    throw new DemoSettleError("failed", "fee_over_ceiling");
  assembled.sign(config.submitter);
  return assembled;
}

async function readSettledEvent(
  server: rpc.Server,
  hash: string,
  ledger: number
): Promise<ReturnType<typeof decodeSettledEvent>> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const result = await server.getEvents({
      startLedger: ledger,
      endLedger: ledger + 1,
      filters: [
        { type: "contract", contractIds: [UPTO_CONTRACT_ID], topics: [[SETTLED_TOPIC, "*", "*"]] },
      ],
      limit: 100,
    });
    const match = result.events.find((event) => event.txHash === hash);
    if (match) {
      return decodeSettledEvent(
        match.topic.map((topic) => topic.toXDR("base64")),
        match.value.toXDR("base64")
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null;
}

export interface SettleOutcome {
  readonly success: SettleSuccess;
  readonly local: RecentSettlement;
}

/**
 * Signs the ceiling as the demo buyer and settles `min(cost, ceiling)` against the
 * UptoSettlement contract. Returns only after the transaction is confirmed
 * and its `settled` event has been read back and matches what was requested.
 */
export async function settleOnTestnet(
  config: DemoConfig,
  request: SettleRequest,
  tag: string,
  deadline: number
): Promise<SettleOutcome> {
  const server = new rpc.Server(RPC_URL);
  const network = await server.getNetwork();
  if (network.passphrase !== NETWORK_PASSPHRASE)
    throw new DemoSettleError("demo_unavailable", "not_testnet");

  const balance = await assertNonCustodial(config);
  if (balance < request.ceiling) throw new DemoSettleError("demo_unfunded", "buyer_balance");

  const charge = computeCharge(request);
  let hash = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (Date.now() > deadline) throw new DemoSettleError("unconfirmed", "deadline_before_submit");
    const tx = await buildSignedSettlement(server, config, request, charge.actual, tag);
    hash = tx.hash().toString("hex");
    const sent = await server.sendTransaction(tx);
    if (isBadSequence(sent)) continue;
    if (!assertOperationOk(sent)) throw new DemoSettleError("failed", "submit_rejected");
    break;
  }
  if (!hash) throw new DemoSettleError("failed", "submit_rejected");

  let confirmed: rpc.Api.GetTransactionResponse | null = null;
  while (Date.now() < deadline) {
    try {
      const status = await server.getTransaction(hash);
      if (status.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) {
        confirmed = status;
        break;
      }
    } catch {
      // A transient RPC error while polling must not orphan a submitted transaction: keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const local: RecentSettlement = { hash, createdAt: Date.now(), visitorTag: tag };
  if (!confirmed) throw new DemoSettleError("unconfirmed", "poll_deadline", hash);
  if (confirmed.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new DemoSettleError("failed", "transaction_failed", hash);
  }

  const settled = await readSettledEvent(server, hash, confirmed.ledger).catch(() => null);
  if (
    !settled ||
    settled.from !== config.buyer.publicKey() ||
    settled.to !== config.seller ||
    settled.asset !== USDC_CONTRACT_ID ||
    settled.maxAmount !== request.ceiling ||
    settled.actualAmount !== charge.actual
  ) {
    throw new DemoSettleError("failed", "event_mismatch", hash);
  }

  return {
    local,
    success: {
      status: "settled",
      hash,
      ledger: confirmed.ledger,
      network: "stellar:testnet",
      ceiling: request.ceiling.toString(),
      cost: charge.cost.toString(),
      capped: charge.capped,
      settled: {
        maxAmount: settled.maxAmount.toString(),
        actualAmount: settled.actualAmount.toString(),
      },
      buyer: settled.from,
      seller: settled.to,
    },
  };
}
