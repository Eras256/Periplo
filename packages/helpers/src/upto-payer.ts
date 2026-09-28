/**
 * Buyer-side `upto` payer: signs a spending ceiling once, before usage is
 * known, and lets the facilitator settle the real amount later. No
 * published `@x402/stellar` class builds this client-side signing path
 * (only the `exact` scheme ships one), so this builds the Soroban
 * authorization directly with `@stellar/stellar-sdk`, matching the same
 * mechanics `apps/facilitator/src/upto-stellar-scheme.ts` already proved:
 * the signed auth entry's root invocation covers only `(authorization,)`,
 * never `actual_amount`, so the value passed as `actual_amount` while
 * building this entry is a placeholder that never gets signed over. The
 * built transaction is never submitted by the buyer: only its Soroban
 * authorization entry is reused, verbatim, by the facilitator's own
 * `/settle`, so no account-level transaction signature is needed here.
 *
 * The facilitator's signing address (`authorization.facilitator`) is not
 * carried in the 402 challenge's `extra`; it comes from `GET /supported`'s
 * top-level `signers` map (`HTTPFacilitatorClient.getSupported()`, the
 * real published client, not a hand-rolled fetch).
 */

import { randomBytes } from "node:crypto";
import { BASE_FEE, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { Client as ContractClient } from "@stellar/stellar-sdk/contract";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type {
  Network,
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
} from "@x402/core/types";
import {
  getEstimatedLedgerCloseTimeSeconds,
  getNetworkPassphrase,
  getRpcClient,
  isStellarNetwork,
  STELLAR_TESTNET_CAIP2,
} from "@x402/stellar";
import type { PaymentPayer } from "./buyer-client.js";

export class UptoMainnetNotSupportedError extends Error {
  override readonly name = "UptoMainnetNotSupportedError";
  readonly code = "upto_mainnet_not_supported";
}

export class NoUptoPaymentOptionError extends Error {
  override readonly name = "NoUptoPaymentOptionError";
  readonly code = "upto_no_matching_requirement";
}

export class SpendingCeilingExceededError extends Error {
  override readonly name = "SpendingCeilingExceededError";
  readonly code = "upto_spending_ceiling_exceeded";
  readonly requestedCeiling: bigint;
  readonly configuredMax: bigint;
  constructor(requestedCeiling: bigint, configuredMax: bigint) {
    super(
      `Requested upto ceiling ${requestedCeiling} exceeds the configured ` +
        `maxSpendPerAuthorization of ${configuredMax}`
    );
    this.requestedCeiling = requestedCeiling;
    this.configuredMax = configuredMax;
  }
}

export class UptoFacilitatorSignerUnavailableError extends Error {
  override readonly name = "UptoFacilitatorSignerUnavailableError";
  readonly code = "upto_facilitator_signer_unavailable";
}

export class UptoSimulationError extends Error {
  override readonly name = "UptoSimulationError";
  readonly code = "upto_simulation_failed";
}

/** Picks the first Stellar `upto`/`contract`-profile option for `network`. Pure, no I/O. */
export function selectUptoStellarRequirement(
  accepts: readonly PaymentRequirements[],
  network: string
): PaymentRequirements | undefined {
  return accepts.find(
    (a) =>
      a.scheme === "upto" &&
      a.network === network &&
      (a.extra as Record<string, unknown> | undefined)?.uptoProfile === "contract"
  );
}

export interface CreateUptoStellarPayerOptions {
  /** Base URL of the facilitator this payer will pay through, used only to
   * discover its signing address via `GET /supported` (never to submit a
   * transaction: the buyer's own process never calls `/settle`). */
  readonly facilitatorBaseUrl: string;
  /**
   * Hard local cap, in the asset's base units, checked against the
   * server's requested ceiling before anything is signed. Required, not
   * optional: a buyer that skips this is trusting the resource server's
   * own price completely, which is exactly what `upto` is supposed to
   * remove the need for.
   */
  readonly maxSpendPerAuthorization: bigint;
  readonly rpcUrl?: string;
  /**
   * How far past the current ledger the signed ceiling stays valid, in
   * ledgers. Defaults to the requirement's own `maxTimeoutSeconds`
   * converted via the network's estimated ledger close time, the same
   * conversion the facilitator itself checks the deadline against
   * (`invalid_upto_stellar_window_too_long` otherwise); only override this
   * if you need a specific, deterministic ledger count (e.g. in a test).
   */
  readonly deadlineLedgerOffset?: number;
  readonly facilitatorClient?: Pick<HTTPFacilitatorClient, "getSupported">;
}

async function resolveFacilitatorSigner(
  client: Pick<HTTPFacilitatorClient, "getSupported">,
  network: Network
): Promise<string> {
  const supported = await client.getSupported();
  const family = `${network.split(":")[0]}:*`;
  const list = supported.signers[network] ?? supported.signers[family];
  if (!list || list.length === 0) {
    throw new UptoFacilitatorSignerUnavailableError(
      `Facilitator advertises no signer for ${network} or ${family} in GET /supported`
    );
  }
  const address = list[0];
  if (!address) {
    throw new UptoFacilitatorSignerUnavailableError(
      `Facilitator's signer list for ${network} is present but empty`
    );
  }
  return address;
}

/**
 * Builds a `PaymentPayer` (drop-in for `payAndFetch`/`discoverPayAndFetch`)
 * that signs an `upto` spending ceiling for `network` (currently
 * `"stellar:testnet"` only; any other network, including pubnet, throws
 * `UptoMainnetNotSupportedError` because this project has no mainnet fee
 * sponsor key). The secret never leaves this process.
 */
export function createUptoStellarPayer(
  secretKey: string,
  network: Network,
  options: CreateUptoStellarPayerOptions
): PaymentPayer {
  if (network !== STELLAR_TESTNET_CAIP2) {
    throw new UptoMainnetNotSupportedError(
      `upto is only supported on ${STELLAR_TESTNET_CAIP2} today; ${network} ` +
        "(including any pubnet/mainnet network) is not yet supported."
    );
  }
  if (!isStellarNetwork(network)) {
    throw new UptoMainnetNotSupportedError(`${network} is not a recognized Stellar network`);
  }

  const buyer = Keypair.fromSecret(secretKey);
  const rpcConfig = options.rpcUrl ? { url: options.rpcUrl } : undefined;
  const server = getRpcClient(network, rpcConfig);
  const networkPassphrase = getNetworkPassphrase(network);
  const facilitatorClient =
    options.facilitatorClient ?? new HTTPFacilitatorClient({ url: options.facilitatorBaseUrl });

  return {
    network,
    async createPaymentPayload(paymentRequired: PaymentRequired): Promise<PaymentPayload> {
      const requirements = selectUptoStellarRequirement(paymentRequired.accepts, network);
      if (!requirements) {
        throw new NoUptoPaymentOptionError(
          `No "upto"/"contract" payment option for ${network} in this challenge ` +
            `(offered: ${paymentRequired.accepts.map((a) => `${a.scheme}/${a.network}`).join(", ")})`
        );
      }
      const maxAmount = BigInt(requirements.amount);
      if (maxAmount > options.maxSpendPerAuthorization) {
        throw new SpendingCeilingExceededError(maxAmount, options.maxSpendPerAuthorization);
      }
      const settlementContract = (requirements.extra as Record<string, unknown>)
        .settlementContract as string | undefined;
      if (!settlementContract) {
        throw new NoUptoPaymentOptionError("upto requirement is missing extra.settlementContract");
      }

      const facilitatorAddress = await resolveFacilitatorSigner(facilitatorClient, network);
      const latestLedger = await server.getLatestLedger();
      const currentLedger = latestLedger.sequence;
      const estimatedLedgerSeconds = await getEstimatedLedgerCloseTimeSeconds(network);
      const deadlineLedgerOffset =
        options.deadlineLedgerOffset ??
        Math.ceil(requirements.maxTimeoutSeconds / estimatedLedgerSeconds);
      const nonce = randomBytes(32);
      const authorization = {
        from: buyer.publicKey(),
        to: requirements.payTo,
        asset: requirements.asset,
        max_amount: maxAmount,
        valid_after_ledger: currentLedger,
        deadline_ledger: currentLedger + deadlineLedgerOffset,
        nonce,
        facilitator: facilitatorAddress,
      };

      // Sourced by the FACILITATOR's account, not the buyer's: Soroban's
      // simulation auto-satisfies require_auth_for_args for whichever
      // address is the transaction SOURCE (no explicit, signable auth
      // entry is ever produced for it), and only produces an explicit
      // entry for every OTHER address a call requires authorization from.
      // Sourcing by the buyer would auto-satisfy the buyer's own
      // authorization implicitly and never hand back an entry to sign at
      // all (confirmed live: `AssembledTransaction.signAuthEntries` throws
      // "No auth entries for public key <buyer>" when tried). Sourcing by
      // the facilitator is also exactly what the facilitator's own
      // eventual re-simulation does, so the discovered auth shape matches
      // what `/settle` expects to reuse verbatim.
      const client = await ContractClient.from({
        contractId: settlementContract,
        networkPassphrase,
        rpcUrl: options.rpcUrl ?? "https://soroban-testnet.stellar.org",
        publicKey: facilitatorAddress,
        signTransaction: buyer,
      });

      // actual_amount is a placeholder: require_auth_for_args((authorization,))
      // never covers it, so any value reaches an identical signed auth entry.
      const tx = await (
        client as unknown as {
          settle: (
            args: { authorization: typeof authorization; actual_amount: bigint },
            opts?: Record<string, unknown>
          ) => Promise<{
            simulation?: { error?: unknown };
            signAuthEntries: (opts: {
              address: string;
              signAuthEntry: typeof buyer;
            }) => Promise<void>;
            built: { operations: readonly unknown[] };
          }>;
        }
      ).settle({ authorization, actual_amount: maxAmount });

      if (tx.simulation && "error" in tx.simulation && tx.simulation.error) {
        throw new UptoSimulationError(
          `Simulating settle() for the ceiling failed: ${String(tx.simulation.error)}`
        );
      }
      await tx.signAuthEntries({ address: buyer.publicKey(), signAuthEntry: buyer });

      // The transaction just built and signed is sourced by the
      // facilitator (needed above so simulation produces a signable entry
      // for the buyer, see the comment on `ContractClient.from`), but the
      // facilitator itself rejects any client payload whose tx/op source
      // is one of its own signing addresses (a safety rule: a client must
      // never be able to make the facilitator's own account the origin of
      // an operation it didn't choose). So the invoke operation is lifted
      // into a fresh transaction sourced by the buyer instead. This second
      // transaction is still never submitted; only its operation is ever
      // read back (`_verify` never inspects the outer envelope's own
      // signature or fee).
      //
      // Simulating with the facilitator as source also discovers an
      // explicit auth entry FOR the facilitator itself, credentials type
      // `sorobanCredentialsSourceAccount` (Soroban's marker for "this
      // address is the tx source, already implicitly authorized," not a
      // signable entry) alongside the buyer's real, signed
      // `sorobanCredentialsAddress` entry. The facilitator's own `/settle`
      // rejects a client payload carrying ANY non-address-credential
      // entry (`invalid_upto_stellar_payload_unsupported_credential_type`),
      // since it does its own independent discovery for its own
      // requirement at settle time; only the buyer's entry belongs here.
      const builtOperation = tx.built.operations[0] as unknown as {
        func: Parameters<typeof Operation.invokeHostFunction>[0]["func"];
        auth?: readonly { credentials(): { switch(): { name: string } } }[];
      };
      const buyerOnlyAuth = (builtOperation.auth ?? []).filter(
        (entry) => entry.credentials().switch().name === "sorobanCredentialsAddress"
      );
      const buyerAccount = await server.getAccount(buyer.publicKey());
      const finalTx = new TransactionBuilder(buyerAccount, {
        fee: BASE_FEE,
        networkPassphrase,
      })
        .setTimeout(requirements.maxTimeoutSeconds)
        .addOperation(
          Operation.invokeHostFunction({
            func: builtOperation.func,
            auth: buyerOnlyAuth as NonNullable<
              Parameters<typeof Operation.invokeHostFunction>[0]["auth"]
            >,
          })
        )
        .build();

      return {
        x402Version: paymentRequired.x402Version,
        resource: paymentRequired.resource,
        accepted: requirements,
        payload: { transaction: finalTx.toXDR() },
      };
    },
  };
}
