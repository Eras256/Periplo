/**
 * Unit-level coverage for the channel-account pool (spec §2/§7's
 * sequence-number bottleneck under bursty traffic), using throwaway
 * keypairs and a scripted `loadAccount` override, no real network calls,
 * unlike `core.test.ts`'s real-testnet integration suite. `createEd25519Signer`
 * only derives a keypair locally; it never touches the network, so a
 * freshly generated, unfunded `Keypair` is a valid input here.
 */

import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import type { AccountLoader } from "./boot-safety.js";
import { createFacilitatorCore } from "./core.js";

const nativeOnly: AccountLoader = async () => ({ balances: [{ asset_type: "native" }] });
const withUsdcBalance: AccountLoader = async () => ({
  balances: [
    { asset_type: "native" },
    { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: "GISSUER" },
  ],
});

function randomSecret(): string {
  return Keypair.random().secret();
}

describe("createFacilitatorCore: channel-account pool", () => {
  it("boots with a primary signer plus a pool of channel accounts, all fee-only", async () => {
    const core = await createFacilitatorCore({
      signers: { "stellar:testnet": randomSecret() },
      channelAccountSecrets: {
        "stellar:testnet": [randomSecret(), randomSecret(), randomSecret()],
      },
      loadAccount: () => nativeOnly,
    });
    expect(core).toBeDefined();
  });

  it("advertises every pool member's address as a signer, not just the primary", async () => {
    const core = await createFacilitatorCore({
      signers: { "stellar:testnet": randomSecret() },
      channelAccountSecrets: { "stellar:testnet": [randomSecret(), randomSecret()] },
      loadAccount: () => nativeOnly,
    });
    const supported = core.getSupported();
    const allSigners = Object.values(supported.signers).flat();
    // Primary + 2 channel accounts = 3 distinct addresses advertised.
    expect(new Set(allSigners).size).toBe(3);
  });

  it("refuses to boot if ANY channel account holds a non-native balance, not just the primary", async () => {
    const testnetChannelSecret = randomSecret();
    await expect(
      createFacilitatorCore({
        signers: { "stellar:testnet": randomSecret() },
        channelAccountSecrets: { "stellar:testnet": [testnetChannelSecret] },
        loadAccount: () => async (publicKey: string) =>
          // The primary is fee-only; only the channel account is custodial,
          // proving the check runs per pool member, not just the primary.
          publicKey === Keypair.fromSecret(testnetChannelSecret).publicKey()
            ? withUsdcBalance("")
            : nativeOnly(""),
      })
    ).rejects.toThrow(/holds non-native/);
  });

  it("boots fine with no channel accounts configured (pool of one, unchanged behavior)", async () => {
    const core = await createFacilitatorCore({
      signers: { "stellar:testnet": randomSecret() },
      loadAccount: () => nativeOnly,
    });
    const supported = core.getSupported();
    const allSigners = Object.values(supported.signers).flat();
    expect(allSigners).toHaveLength(1);
  });

  it("builds a full, undeduplicated 4-address signer set across two networks each with their own pool (regression guard, not a direct proof of settle-time isolation)", async () => {
    // What this test can and can't prove: `getSupported()` groups
    // addresses by CAIP-2 family ("stellar"), not by exact network
    // (confirmed reading `@x402/core`'s real `getSupported()` source), so
    // it can't observe which scheme instance a given settle() call
    // actually dispatches to. What it DOES catch: `core.ts` building only
    // one combined pool total instead of one per network (e.g. an
    // off-by-one in the per-network loop silently reusing the same
    // array), which would surface here as fewer than 4 distinct
    // addresses. The actual cross-network isolation fix — one
    // `ExactStellarScheme` instance per network, registered only for that
    // network, so its own `selectSigner` round-robin can never reach the
    // other network's addresses — is a construction-time guarantee
    // verified by reading `core.ts`'s own per-network loop, not something
    // observable through this package's public API.
    const core = await createFacilitatorCore({
      signers: {
        "stellar:testnet": randomSecret(),
        "stellar:pubnet": randomSecret(),
      },
      channelAccountSecrets: {
        "stellar:testnet": [randomSecret()],
        "stellar:pubnet": [randomSecret()],
      },
      loadAccount: () => nativeOnly,
    });
    const supported = core.getSupported();
    const allSigners = Object.values(supported.signers).flat();
    expect(new Set(allSigners).size).toBe(4);
  });
});
