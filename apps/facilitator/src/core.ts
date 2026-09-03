/**
 * Facilitator core: importable as a library, not just runnable as a
 * service (spec §5 Phase 3, "the facilitator core must be importable as a
 * library, not only runnable as a service"). This is what makes all three
 * deployment paths first-class:
 *
 *   1. Hosted: `app.ts` wraps this in a Hono HTTP server.
 *   2. Self-hosted: same as (1), someone else runs it.
 *   3. Self-facilitation inside a resource server: a seller imports
 *      `createFacilitatorCore` directly and calls `verify`/`settle` in
 *      process, no HTTP hop, no separately-operated facilitator at all.
 *
 * Deliberately does NOT reimplement verify/settle (spec §1 constraint 2):
 * all of it is `@x402/core`'s `x402Facilitator` dispatching to
 * `@x402/stellar`'s `ExactStellarScheme`, which is where the per-payment
 * safety properties actually live (facilitator not the `from` address,
 * not a signer in a client auth entry, simulation emits only the expected
 * transfer, see that package's own doc comments). This module's job is
 * wiring, plus the boot-time non-custodial check in `boot-safety.ts`,
 * which `@x402/stellar` has no reason to know about (it's an operational
 * constraint on the caller's key, not a wire-protocol concern).
 */

import { x402Facilitator } from "@x402/core/facilitator";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { createEd25519Signer, getHorizonClient } from "@x402/stellar";
// NOT from the "@x402/stellar" main barrel: it re-exports the CLIENT
// variant of ExactStellarScheme (same class name, different subpath,
// `./exact/client`). The facilitator variant that implements
// SchemeNetworkFacilitator (verify/settle/getSigners/getExtra) lives at
// this subpath instead. Importing the wrong one type-errors confusingly
// (TypeScript reports it as missing ClientStellarSigner properties)
// rather than pointing at the real cause, worth this comment so it's
// not "fixed" back to the barrel import later.
import { ExactStellarScheme } from "@x402/stellar/exact/facilitator";
import { type AccountLoader, assertNonCustodialSigner } from "./boot-safety.js";
import { UptoStellarScheme } from "./upto-stellar-scheme.js";

export const STELLAR_NETWORKS = ["stellar:testnet", "stellar:pubnet"] as const;
export type StellarNetwork = (typeof STELLAR_NETWORKS)[number];

export interface FacilitatorCoreConfig {
  /**
   * Fee-sponsor secret key per network. Only networks with a configured
   * secret are registered and advertised in `/supported`, a facilitator
   * that only has a testnet key should only claim testnet (spec §0's own
   * observation about the reference facilitator: advertised support and
   * reachable support must match).
   */
  readonly signers: Partial<Record<StellarNetwork, string>>;
  /**
   * Additional channel accounts per network (spec §2/§7: "the facilitator
   * is the transaction source, so its sequence number is the bottleneck
   * under bursty agent traffic. Use channel accounts"), pooled together
   * with `signers[network]` and handed as one array to
   * `ExactStellarScheme`/`UptoStellarScheme`. Both already accept an array
   * of signers and round-robin across them (`selectSigner`, default
   * round-robin, `@x402/stellar`'s own mechanism, not reimplemented here),
   * using the selected signer's own account — and so its own sequence
   * number — as the rebuilt transaction's source (confirmed reading
   * `ExactStellarScheme.settle()`'s real compiled source:
   * `server.getAccount(signer.address)`). Configuring N extra secrets here
   * is the whole mechanism: no custom pool/lock code needed. Each entry
   * must be fee-only (spec §1 constraint 3), enforced the same
   * `assertNonCustodialSigner` way as the primary signer, one call per
   * pool member, before the facilitator is considered booted.
   */
  readonly channelAccountSecrets?: Partial<Record<StellarNetwork, readonly string[]>>;
  readonly rpcConfig?: { readonly url?: string };
  /** Safety ceiling in stroops passed through to ExactStellarScheme (default: library default, 50_000). */
  readonly maxTransactionFeeStroops?: number;
  /**
   * `UptoSettlement` contract address per network (Phase 6,
   * `contracts/upto-settlement`). Only networks with a configured address
   * get `upto` registered alongside `exact`; a facilitator with no
   * address configured simply doesn't advertise `upto` support, same
   * "advertised support and reachable support must match" principle as
   * `signers` above. See `upto-stellar-scheme.ts` for the scheme
   * implementation itself.
   */
  readonly uptoSettlementContracts?: Partial<Record<StellarNetwork, string>>;
  /** Safety ceiling in stroops passed through to UptoStellarScheme (default: 300_000, see upto-stellar-scheme.ts). */
  readonly uptoMaxTransactionFeeStroops?: number;
  /** Overridable for tests; defaults to the real Horizon client per network. */
  readonly loadAccount?: (network: StellarNetwork) => AccountLoader;
}

export interface FacilitatorCore {
  getSupported(): ReturnType<x402Facilitator["getSupported"]>;
  verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse>;
  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse>;
}

function defaultLoadAccount(network: StellarNetwork): AccountLoader {
  const horizon = getHorizonClient(network);
  return (publicKey: string) => horizon.loadAccount(publicKey);
}

/**
 * Builds the facilitator core. Async because it performs the boot-time
 * non-custodial check against every configured signer before returning,
 * per spec §1 constraint 3, there is no valid `FacilitatorCore` for a
 * misconfigured key, so construction itself is where that's enforced.
 */
export async function createFacilitatorCore(
  config: FacilitatorCoreConfig
): Promise<FacilitatorCore> {
  const configuredNetworks = STELLAR_NETWORKS.filter((network) => config.signers[network]);
  if (configuredNetworks.length === 0) {
    throw new Error(
      "Refusing to boot: no fee-sponsor signer configured for any network (spec §2 requires both " +
        "stellar:testnet and stellar:pubnet as committed deliverables, but at least one must be " +
        "configured to serve anything at all)."
    );
  }

  const loadAccountFor = config.loadAccount ?? defaultLoadAccount;

  // One signer pool PER network, never combined across networks. Each
  // network's `ExactStellarScheme`/`UptoStellarScheme` instance below is
  // constructed from, and registered only for, its own pool: passing a
  // single shared instance to `facilitator.register([testnet, pubnet],
  // scheme)` with both networks' addresses pooled together (this file's
  // prior shape, harmless only because production has only ever
  // configured one network at a time) would let the library's own
  // round-robin `selectSigner` pick a *pubnet* signer address for a
  // *testnet* settlement or vice versa, since it round-robins over
  // whatever address set the scheme was built with, with no network
  // awareness of its own (confirmed reading `ExactStellarScheme`'s real
  // compiled source: `this.selectSigner([...this.signingAddresses])`,
  // no network filter). Not a fund-safety bug (the mismatched account
  // simply doesn't exist on the wrong network's RPC, so settlement fails
  // closed), but a real availability hazard, found and fixed while adding
  // the channel-account pool below, not before it.
  const networkPools = await Promise.all(
    configuredNetworks.map(async (network) => {
      const secret = config.signers[network];
      if (!secret) {
        throw new Error(`Unreachable: ${network} was filtered as configured but has no secret`);
      }
      const primary = createEd25519Signer(secret, network);
      const additionalSecrets = config.channelAccountSecrets?.[network] ?? [];
      const additional = additionalSecrets.map((channelSecret) =>
        createEd25519Signer(channelSecret, network)
      );
      const pool = [primary, ...additional];
      await Promise.all(
        pool.map((signer) =>
          assertNonCustodialSigner(signer.address, network, loadAccountFor(network))
        )
      );
      return { network, pool };
    })
  );

  const facilitator = new x402Facilitator();
  for (const { network, pool } of networkPools) {
    const scheme = new ExactStellarScheme(pool, {
      areFeesSponsored: true,
      ...(config.rpcConfig ? { rpcConfig: config.rpcConfig } : {}),
      ...(config.maxTransactionFeeStroops !== undefined
        ? { maxTransactionFeeStroops: config.maxTransactionFeeStroops }
        : {}),
    });
    facilitator.register([network], scheme);
  }

  const uptoNetworks = configuredNetworks.filter(
    (network) => config.uptoSettlementContracts?.[network]
  );
  for (const network of uptoNetworks) {
    const pool = networkPools.find((entry) => entry.network === network)?.pool;
    if (!pool) {
      throw new Error(`Unreachable: ${network} was filtered as upto-configured but has no pool`);
    }
    const contractAddress = config.uptoSettlementContracts?.[network];
    if (!contractAddress) {
      throw new Error(
        `Unreachable: ${network} was filtered as upto-configured but has no contract`
      );
    }
    const uptoScheme = new UptoStellarScheme(
      pool,
      { [network]: contractAddress },
      {
        ...(config.rpcConfig ? { rpcConfig: config.rpcConfig } : {}),
        ...(config.uptoMaxTransactionFeeStroops !== undefined
          ? { maxTransactionFeeStroops: config.uptoMaxTransactionFeeStroops }
          : {}),
      }
    );
    facilitator.register([network], uptoScheme);
  }

  return {
    getSupported: () => facilitator.getSupported(),
    verify: (payload, requirements) => facilitator.verify(payload, requirements),
    settle: (payload, requirements) => facilitator.settle(payload, requirements),
  };
}
