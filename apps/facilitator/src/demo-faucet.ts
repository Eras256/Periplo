/**
 * Server-side half of the wallet-less demo flow (`/demo/play`): a visitor's
 * browser generates a one-time keypair and funds it with testnet XLM via
 * friendbot, but friendbot only ever provides native XLM, never a custom
 * asset (spec §2's own "an account needs a trustline before it can
 * receive a SEP-41 asset" warning applies here directly). A fresh
 * ephemeral account has zero `PTEST` and no trustline to it, so it can't
 * pay for anything yet.
 *
 * This module builds ONE transaction with two operations — `changeTrust`
 * (source: the visitor's ephemeral account) and `payment` (source: this
 * project's own PTEST-holding faucet account, sending a small amount) —
 * signs it with the faucet's own key server-side, and returns the
 * partially-signed XDR. The browser adds the ephemeral key's own
 * signature (required because `changeTrust`'s operation-level source
 * differs from the transaction's own source account) and submits
 * directly to Horizon itself. The ephemeral secret never reaches this
 * server, matching the same non-custodial spirit as the facilitator's
 * own signing boundary, even though this endpoint is a convenience
 * faucet, not `verify`/`settle`.
 *
 * Reuses `STELLAR_TEST_BUYER_SECRET`, the same real testnet fixture
 * `settle-demo.ts` already spends from, deliberately: it already holds a
 * large PTEST balance, and adding a second, separate faucet-only key
 * would just be one more secret to provision for the same testnet-only
 * purpose.
 */

import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

export interface DemoFaucetConfig {
  /** The faucet account's own secret key (reused test buyer fixture, see module doc). */
  readonly faucetSecret: string;
  /** PTEST's classic asset code. */
  readonly assetCode: string;
  /** PTEST's classic issuer account. */
  readonly assetIssuer: string;
  /** Amount of PTEST to grant per visitor, in whole-unit decimal string form (e.g. "1"). */
  readonly grantAmount: string;
  /** Overridable for tests; defaults to the real testnet Horizon server. */
  readonly horizonUrl?: string;
}

export interface PreparedFaucetTransaction {
  /** The transaction XDR, already signed by the faucet key; needs the visitor's own ephemeral signature added before submission. */
  readonly transactionXdr: string;
  readonly networkPassphrase: string;
}

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

/**
 * Builds and faucet-signs the onboarding transaction for one visitor's
 * ephemeral public key. Throws if the faucet account can't be loaded
 * (e.g. Horizon unreachable) — the caller turns that into a clean HTTP
 * error, same posture as `/discovery/*`'s `requireCatalogClient`.
 */
export async function prepareFaucetTransaction(
  ephemeralPublicKey: string,
  config: DemoFaucetConfig
): Promise<PreparedFaucetTransaction> {
  const horizon = new Horizon.Server(config.horizonUrl ?? "https://horizon-testnet.stellar.org");
  const faucetKeypair = Keypair.fromSecret(config.faucetSecret);
  const asset = new Asset(config.assetCode, config.assetIssuer);

  const faucetAccount = await horizon.loadAccount(faucetKeypair.publicKey());

  const transaction = new TransactionBuilder(faucetAccount, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(
      Operation.changeTrust({
        asset,
        source: ephemeralPublicKey,
      })
    )
    .addOperation(
      Operation.payment({
        destination: ephemeralPublicKey,
        asset,
        amount: config.grantAmount,
      })
    )
    .setTimeout(120)
    .build();

  transaction.sign(faucetKeypair);

  return {
    transactionXdr: transaction.toXDR(),
    networkPassphrase: TESTNET_PASSPHRASE,
  };
}
