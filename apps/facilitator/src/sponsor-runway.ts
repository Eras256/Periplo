/**
 * Fee-sponsor XLM runway check (SCF #45 post-panel-review roadmap, item 3:
 * mainnet sponsor-key rotation runbook, `docs/OPERATIONS.md`).
 *
 * The alerting half of that item does not need to wait on a mainnet key:
 * a fee-sponsor account only ever holds native XLM (`boot-safety.ts`
 * already enforces that at boot), so "how many hours of fee-paying can
 * this balance still cover" is answerable against the real, already-live
 * testnet fee-sponsor account today, and the same code applies unchanged
 * to a mainnet account once one exists.
 *
 * Pure logic (`computeSponsorRunway`) is unit-tested against fixed inputs,
 * same split as `boot-safety.ts`'s injected `AccountLoader`: no live
 * network call in `pnpm test`. `fetchSponsorRunway` does the real Horizon
 * REST calls and is exercised only by `scripts/sponsor-runway-alert.ts`.
 */

export interface HorizonBalance {
  readonly asset_type: string;
  readonly balance: string;
}

export interface HorizonAccount {
  readonly balances: readonly HorizonBalance[];
}

export interface HorizonTransactionRecord {
  readonly source_account: string;
  readonly fee_charged: string;
  readonly created_at: string;
}

export interface RunwayCheckResult {
  readonly sponsorPublicKey: string;
  readonly network: string;
  readonly balanceStroops: number;
  readonly lookbackHours: number;
  readonly feeChargedStroopsInWindow: number;
  readonly burnRateStroopsPerHour: number;
  /** `Infinity` when the burn rate is zero and the balance is positive:
   * there is real XLM and nothing observed spending it in the window. */
  readonly runwayHours: number;
  readonly thresholdHours: number;
  readonly belowThreshold: boolean;
}

export const STROOPS_PER_XLM = 10_000_000;

export class SponsorAccountUnreadableError extends Error {
  override readonly name = "SponsorAccountUnreadableError";
}

function nativeBalanceStroops(account: HorizonAccount, sponsorPublicKey: string): number {
  const native = account.balances.find((b) => b.asset_type === "native");
  if (!native) {
    throw new SponsorAccountUnreadableError(
      `Fee-sponsor account ${sponsorPublicKey} has no native XLM balance entry ` +
        "(cannot assess runway if the balance can't be read)."
    );
  }
  return Math.round(Number(native.balance) * STROOPS_PER_XLM);
}

/**
 * Computes fee-runway from an already-fetched account and an
 * already-fetched, already-windowed list of transactions. Does not filter
 * or paginate: that's `fetchSponsorRunway`'s job. Only counts transactions
 * whose `source_account` is the sponsor itself, the same defensive check
 * `boot-safety.ts` applies elsewhere: this project's own architecture
 * guarantees the fee-sponsor is always the transaction source
 * (spec §1 constraint 3), but a monitoring tool should not silently trust
 * an upstream endpoint's own filtering to enforce that for it.
 */
export function computeSponsorRunway(
  account: HorizonAccount,
  transactionsInWindow: readonly HorizonTransactionRecord[],
  sponsorPublicKey: string,
  network: string,
  lookbackHours: number,
  thresholdHours: number
): RunwayCheckResult {
  const balanceStroops = nativeBalanceStroops(account, sponsorPublicKey);

  const feeChargedStroopsInWindow = transactionsInWindow
    .filter((tx) => tx.source_account === sponsorPublicKey)
    .reduce((sum, tx) => sum + Number(tx.fee_charged), 0);

  const burnRateStroopsPerHour = feeChargedStroopsInWindow / lookbackHours;

  let runwayHours: number;
  if (balanceStroops <= 0) {
    // Zero or negative balance is critical regardless of burn rate: there
    // is nothing left to pay a fee with, observed spending or not.
    runwayHours = 0;
  } else if (burnRateStroopsPerHour <= 0) {
    runwayHours = Number.POSITIVE_INFINITY;
  } else {
    runwayHours = balanceStroops / burnRateStroopsPerHour;
  }

  return {
    sponsorPublicKey,
    network,
    balanceStroops,
    lookbackHours,
    feeChargedStroopsInWindow,
    burnRateStroopsPerHour,
    runwayHours,
    thresholdHours,
    belowThreshold: runwayHours < thresholdHours,
  };
}
