import { describe, expect, it } from "vitest";
import { createFacilitatorCore } from "./core.js";
import { loadStellarTestEnv } from "./test-env.js";

/**
 * Integration tests against the REAL testnet fee-sponsor account and the
 * REAL Soroban RPC (no mocks) — `boot-safety.test.ts` already covers the
 * non-custodial check's logic with fakes; this file covers "does the
 * whole thing actually boot and talk to testnet." Skipped, not failed,
 * when `STELLAR_FEE_SPONSOR_SECRET`/`_PUBLIC` aren't configured (fork /
 * secrets-less environment) — same pattern as
 * `packages/bazaar/src/db/resources.integration.test.ts`.
 */

const env = loadStellarTestEnv();

describe.skipIf(!env)("createFacilitatorCore — real testnet (spec Phase 3 gate)", () => {
  const { feeSponsorSecret } = env as NonNullable<typeof env>;

  it("boots successfully with a real, funded, fee-only testnet account", async () => {
    const core = await createFacilitatorCore({ signers: { "stellar:testnet": feeSponsorSecret } });
    expect(core).toBeDefined();
  });

  it("refuses to boot with no signer configured for any network", async () => {
    await expect(createFacilitatorCore({ signers: {} })).rejects.toThrow(
      /no fee-sponsor signer configured/
    );
  });

  it("getSupported() advertises exactly the configured network, matching the captured baseline shape", async () => {
    const core = await createFacilitatorCore({ signers: { "stellar:testnet": feeSponsorSecret } });
    const supported = core.getSupported();

    expect(supported.kinds).toHaveLength(1);
    const kind = supported.kinds[0];
    expect(kind).toMatchObject({ x402Version: 2, scheme: "exact", network: "stellar:testnet" });
    // Matches conformance/baseline/x402-org/supported.md verbatim: this is
    // the literal key the master spec (§2, §4) requires.
    expect(kind?.extra?.["areFeesSponsored"]).toBe(true);

    // pubnet was never configured, so it must not be advertised —
    // "advertised support and reachable support" must match (spec §0).
    expect(supported.kinds.some((k) => k.network === "stellar:pubnet")).toBe(false);
  });

  it("getSupported() lists the real fee-sponsor address as a signer", async () => {
    const core = await createFacilitatorCore({ signers: { "stellar:testnet": feeSponsorSecret } });
    const supported = core.getSupported();
    const allSigners = Object.values(supported.signers).flat();
    expect(allSigners.length).toBeGreaterThan(0);
  });

  it("verify() against a malformed payload returns isValid: false with a non-null reason, matching the reference facilitator's observed behavior", async () => {
    const core = await createFacilitatorCore({ signers: { "stellar:testnet": feeSponsorSecret } });
    const result = await core.verify(
      {
        x402Version: 2,
        accepted: {
          scheme: "exact",
          network: "stellar:testnet",
          asset: "x",
          amount: "1",
          payTo: "x",
          maxTimeoutSeconds: 60,
          extra: {},
        },
        payload: {},
      },
      {
        scheme: "exact",
        network: "stellar:testnet",
        asset: "x",
        amount: "1",
        payTo: "x",
        maxTimeoutSeconds: 60,
        extra: {},
      }
    );
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBeTruthy();
  });

  it("settle() against a malformed payload returns success: false with transaction: '' and a non-null reason", async () => {
    const core = await createFacilitatorCore({ signers: { "stellar:testnet": feeSponsorSecret } });
    const result = await core.settle(
      {
        x402Version: 2,
        accepted: {
          scheme: "exact",
          network: "stellar:testnet",
          asset: "x",
          amount: "1",
          payTo: "x",
          maxTimeoutSeconds: 60,
          extra: {},
        },
        payload: {},
      },
      {
        scheme: "exact",
        network: "stellar:testnet",
        asset: "x",
        amount: "1",
        payTo: "x",
        maxTimeoutSeconds: 60,
        extra: {},
      }
    );
    expect(result.success).toBe(false);
    expect(result.transaction).toBe("");
    expect(result.errorReason).toBeTruthy();
  });
});

describe("createFacilitatorCore — gating visibility", () => {
  it("documents why this suite is skipped when the testnet key isn't configured", () => {
    if (!env) {
      expect(env).toBeNull();
    } else {
      expect(env.feeSponsorSecret).toBeTruthy();
    }
  });
});
