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

  const signers = await Promise.all(
    configuredNetworks.map(async (network) => {
      const secret = config.signers[network];
      if (!secret) {
        throw new Error(`Unreachable: ${network} was filtered as configured but has no secret`);
      }
      const signer = createEd25519Signer(secret, network);
      await assertNonCustodialSigner(signer.address, network, loadAccountFor(network));
      return { network, signer };
    })
  );

  const facilitator = new x402Facilitator();
  const scheme = new ExactStellarScheme(
    signers.map(({ signer }) => signer),
    {
      areFeesSponsored: true,
      ...(config.rpcConfig ? { rpcConfig: config.rpcConfig } : {}),
      ...(config.maxTransactionFeeStroops !== undefined
        ? { maxTransactionFeeStroops: config.maxTransactionFeeStroops }
        : {}),
    }
  );
  facilitator.register(
    signers.map(({ network }) => network),
    scheme
  );

  const uptoNetworks = configuredNetworks.filter(
    (network) => config.uptoSettlementContracts?.[network]
  );
  if (uptoNetworks.length > 0) {
    const uptoScheme = new UptoStellarScheme(
      signers.map(({ signer }) => signer),
      Object.fromEntries(
        uptoNetworks.map((network) => [network, config.uptoSettlementContracts?.[network]])
      ),
      {
        ...(config.rpcConfig ? { rpcConfig: config.rpcConfig } : {}),
        ...(config.uptoMaxTransactionFeeStroops !== undefined
          ? { maxTransactionFeeStroops: config.uptoMaxTransactionFeeStroops }
          : {}),
      }
    );
    facilitator.register(uptoNetworks, uptoScheme);
  }

  return {
    getSupported: () => facilitator.getSupported(),
    verify: (payload, requirements) => facilitator.verify(payload, requirements),
    settle: (payload, requirements) => facilitator.settle(payload, requirements),
  };
}
