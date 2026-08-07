/**
 * Boot-time non-custodial assertion (spec §1 constraint 3): "the process
 * must refuse to start if configured with a key that can move user funds."
 *
 * This is deliberately NOT the same thing as `@x402/stellar`'s own
 * per-payment safety checks (facilitator not the `from` address, not a
 * signer in a client auth entry, simulation emits only the expected
 * transfer — all enforced inside `ExactStellarScheme` itself; see
 * `core.ts`). Those guard each individual payment. This guards the
 * *operator's configuration*, once, before the facilitator serves any
 * traffic at all.
 *
 * The concrete check: a fee-sponsor account exists only to pay Soroban
 * network fees. One holding any asset besides native XLM is a signal that
 * whoever configured it pointed a real funds-holding wallet at the
 * fee-sponsor role by mistake — exactly the misconfiguration this
 * constraint exists to catch before it matters.
 */

export class CustodialKeyError extends Error {
  override readonly name = "CustodialKeyError";
}

export interface AccountBalance {
  readonly asset_type: string;
  readonly asset_code?: string;
  readonly asset_issuer?: string;
}

export interface LoadedAccount {
  readonly balances: readonly AccountBalance[];
}

/** Injected so this is unit-testable without a live network call. */
export type AccountLoader = (publicKey: string) => Promise<LoadedAccount>;

function describeBalance(balance: AccountBalance): string {
  return balance.asset_code && balance.asset_issuer
    ? `${balance.asset_code}:${balance.asset_issuer}`
    : balance.asset_type;
}

export async function assertNonCustodialSigner(
  publicKey: string,
  network: string,
  loadAccount: AccountLoader
): Promise<void> {
  let account: LoadedAccount;
  try {
    account = await loadAccount(publicKey);
  } catch (error) {
    throw new CustodialKeyError(
      `Refusing to boot: could not verify the fee-sponsor account ${publicKey} on ${network} ` +
        `(cannot confirm it's fee-only if it can't be read): ${(error as Error).message}`
    );
  }

  const nonNative = account.balances.filter((balance) => balance.asset_type !== "native");
  if (nonNative.length > 0) {
    const assets = nonNative.map(describeBalance).join(", ");
    throw new CustodialKeyError(
      `Refusing to boot: fee-sponsor account ${publicKey} on ${network} holds non-native ` +
        `balance(s) (${assets}). A fee-sponsor key must hold ONLY XLM — spec §1 constraint 3 ` +
        `requires it never be able to move user funds, and a key holding other assets is a ` +
        `misconfiguration signal, not proof of safety by itself, but reason enough to refuse.`
    );
  }
}
