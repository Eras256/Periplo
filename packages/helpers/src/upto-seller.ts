/**
 * Seller-side `upto` helpers: advertise a spending ceiling, then settle the
 * real, measured usage through the facilitator. Never reimplements
 * verify/settle: both calls go through `HTTPFacilitatorClient`
 * (`@x402/core/server`), the same published client the facilitator's own
 * wire protocol expects. Measuring real usage (tokens generated, seconds
 * of access, rows returned) is the caller's own business logic; this
 * module only covers what's generic: building the `upto` requirements and
 * calling `/settle` with the real amount once usage is known.
 */

import { HTTPFacilitatorClient } from "@x402/core/server";
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  ResourceInfo,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";

export class UptoSettlementExceedsCeilingError extends Error {
  override readonly name = "UptoSettlementExceedsCeilingError";
  readonly code = "upto_settlement_exceeds_ceiling";
}

export class UptoSettlementFailedError extends Error {
  override readonly name = "UptoSettlementFailedError";
  readonly code = "upto_settlement_failed";
  readonly errorReason?: string;
  constructor(message: string, errorReason?: string) {
    super(message);
    if (errorReason !== undefined) this.errorReason = errorReason;
  }
}

export interface UptoRequirementConfig {
  readonly network: Network;
  readonly payTo: string;
  /** SEP-41 SAC contract ID: the asset settled, e.g. testnet USDC or PTEST. */
  readonly asset: string;
  /** The deployed `UptoSettlement` contract address for `network`. */
  readonly settlementContract: string;
  /** The ceiling to advertise, in the asset's base units. */
  readonly maxAmount: bigint;
  readonly maxTimeoutSeconds?: number;
  readonly resource?: ResourceInfo;
}

/**
 * Builds the `PaymentRequirements` to put in a 402 challenge's `accepts`
 * for the `upto`/`contract` profile. `amount` carries the ceiling here
 * (verify-phase semantics); `settleUptoUsage` below builds the
 * settle-phase requirements (amount = real usage) itself.
 */
export function buildUptoRequirements(config: UptoRequirementConfig): PaymentRequirements {
  return {
    scheme: "upto",
    network: config.network,
    asset: config.asset,
    amount: config.maxAmount.toString(),
    payTo: config.payTo,
    maxTimeoutSeconds: config.maxTimeoutSeconds ?? 60,
    extra: {
      areFeesSponsored: true,
      uptoProfile: "contract",
      settlementContract: config.settlementContract,
    },
  };
}

export interface UptoFacilitatorOptions {
  readonly facilitatorBaseUrl: string;
  readonly facilitatorClient?: Pick<HTTPFacilitatorClient, "verify" | "settle">;
}

function client(options: UptoFacilitatorOptions): Pick<HTTPFacilitatorClient, "verify" | "settle"> {
  return (
    options.facilitatorClient ?? new HTTPFacilitatorClient({ url: options.facilitatorBaseUrl })
  );
}

/** Verifies a buyer's signed ceiling is structurally valid, before doing any metered work. */
export async function verifyUptoPayment(
  paymentPayload: PaymentPayload,
  ceilingRequirements: PaymentRequirements,
  options: UptoFacilitatorOptions
): Promise<VerifyResponse> {
  return client(options).verify(paymentPayload, ceilingRequirements);
}

/**
 * Settles `actualAmount` (measured after the work is done) against the
 * ceiling the buyer already signed. Throws `UptoSettlementExceedsCeilingError`
 * before calling the facilitator at all if `actualAmount` would exceed the
 * signed ceiling or is negative; a contract this library controls should
 * never even attempt that call, since the contract would reject it anyway.
 * Throws `UptoSettlementFailedError` if the facilitator itself rejects or
 * fails the settlement.
 */
export async function settleUptoUsage(
  paymentPayload: PaymentPayload,
  ceilingRequirements: PaymentRequirements,
  actualAmount: bigint,
  options: UptoFacilitatorOptions
): Promise<SettleResponse> {
  const ceiling = BigInt(ceilingRequirements.amount);
  if (actualAmount < 0n || actualAmount > ceiling) {
    throw new UptoSettlementExceedsCeilingError(
      `Real usage ${actualAmount} is not within [0, ${ceiling}] (the signed ceiling)`
    );
  }
  const settleRequirements: PaymentRequirements = {
    ...ceilingRequirements,
    amount: actualAmount.toString(),
  };
  const result = await client(options).settle(paymentPayload, settleRequirements);
  if (!result.success) {
    throw new UptoSettlementFailedError(
      `upto settlement failed: ${result.errorReason ?? "no reason given"}`,
      result.errorReason
    );
  }
  return result;
}
