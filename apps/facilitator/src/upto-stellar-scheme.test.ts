import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { describe, expect, it } from "vitest";
import { UptoStellarScheme } from "./upto-stellar-scheme.js";

/**
 * Covers the parts of `UptoStellarScheme` that don't need a live RPC
 * call: constructor validation, `getExtra`/`getSigners`, and every
 * structural rejection in `_verify` that happens before the first
 * network round-trip (protocol version, scheme, network, profile,
 * settlement-contract mismatches, malformed payloads). The real
 * settlement path (auth-entry validation, simulation, actual on-chain
 * `settle()`) needs a real testnet contract and a real signed payment,
 * exercised instead by `apps/facilitator/scripts/upto-http-route-settle-demo.ts`
 * (manual, not part of `pnpm test`, same reason `settle-demo.ts` isn't),
 * with its real settled transaction recorded in `conformance/RESULTS.md`.
 */

const FACILITATOR_ADDRESS = "GDXULEKCDTYLN2RD7ID7ZTVUJVIDYPJTL7OY7DFN7Z5S4XKFFN6FOFLE";
const SETTLEMENT_CONTRACT = "CAK3R734WLT4JU2XMQOJ6NIB3BWGPI442CH44EFJG5AORMXFE7G4MQFW";

function fakeSigner() {
  return {
    address: FACILITATOR_ADDRESS,
    signTransaction: async () => ({ signedTxXdr: "" }),
    signAuthEntry: async () => ({ signedAuthEntry: "" }),
  };
}

function basePayload(overrides: Partial<PaymentPayload> = {}): PaymentPayload {
  return {
    x402Version: 2,
    accepted: {
      scheme: "upto",
      network: "stellar:testnet",
      asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      amount: "1000000",
      payTo: "GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU4APMDLQNBW5QV3W3KO",
      maxTimeoutSeconds: 60,
      extra: {
        areFeesSponsored: true,
        uptoProfile: "contract",
        settlementContract: SETTLEMENT_CONTRACT,
      },
    },
    payload: { transaction: "not-a-real-xdr" },
    ...overrides,
  };
}

function baseRequirements(overrides: Partial<PaymentRequirements> = {}): PaymentRequirements {
  return {
    scheme: "upto",
    network: "stellar:testnet",
    asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    amount: "1000000",
    payTo: "GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU4APMDLQNBW5QV3W3KO",
    maxTimeoutSeconds: 60,
    extra: {
      areFeesSponsored: true,
      uptoProfile: "contract",
      settlementContract: SETTLEMENT_CONTRACT,
    },
    ...overrides,
  };
}

describe("UptoStellarScheme: constructor", () => {
  it("throws when constructed with no signers", () => {
    expect(() => new UptoStellarScheme([], { "stellar:testnet": SETTLEMENT_CONTRACT })).toThrow(
      /at least one signer/i
    );
  });

  it("exposes the fixed scheme name and CAIP family", () => {
    const scheme = new UptoStellarScheme([fakeSigner()], {
      "stellar:testnet": SETTLEMENT_CONTRACT,
    });
    expect(scheme.scheme).toBe("upto");
    expect(scheme.caipFamily).toBe("stellar:*");
  });
});

describe("UptoStellarScheme: getExtra / getSigners", () => {
  const scheme = new UptoStellarScheme([fakeSigner()], {
    "stellar:testnet": SETTLEMENT_CONTRACT,
  });

  it("returns the contract profile's extra shape for a configured network", () => {
    expect(scheme.getExtra("stellar:testnet")).toEqual({
      areFeesSponsored: true,
      uptoProfile: "contract",
      settlementContract: SETTLEMENT_CONTRACT,
    });
  });

  it("returns undefined for a network with no settlement contract configured", () => {
    expect(scheme.getExtra("stellar:pubnet")).toBeUndefined();
  });

  it("returns every configured facilitator signer address", () => {
    expect(scheme.getSigners("stellar:testnet")).toEqual([FACILITATOR_ADDRESS]);
  });
});

describe("UptoStellarScheme.verify: structural rejections before any network call", () => {
  const scheme = new UptoStellarScheme([fakeSigner()], {
    "stellar:testnet": SETTLEMENT_CONTRACT,
  });

  it("rejects an unsupported x402 protocol version", async () => {
    const result = await scheme.verify(basePayload({ x402Version: 1 }), baseRequirements());
    expect(result).toEqual({ isValid: false, invalidReason: "invalid_x402_version" });
  });

  it("rejects a scheme other than upto in the payload", async () => {
    const payload = basePayload();
    payload.accepted.scheme = "exact";
    const result = await scheme.verify(payload, baseRequirements());
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("unsupported_scheme");
  });

  it("rejects a scheme other than upto in the requirements", async () => {
    const result = await scheme.verify(basePayload(), baseRequirements({ scheme: "exact" }));
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("unsupported_scheme");
  });

  it("rejects a network mismatch between payload and requirements", async () => {
    const result = await scheme.verify(
      basePayload(),
      baseRequirements({ network: "stellar:pubnet" })
    );
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("network_mismatch");
  });

  it("rejects a network this scheme instance has no settlement contract for", async () => {
    const payload = basePayload();
    payload.accepted.network = "stellar:pubnet";
    const result = await scheme.verify(payload, baseRequirements({ network: "stellar:pubnet" }));
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("upto_not_supported_on_network");
  });

  it("rejects a profile other than contract in the payload", async () => {
    const payload = basePayload();
    (payload.accepted.extra as Record<string, unknown>).uptoProfile = "stateless";
    const result = await scheme.verify(payload, baseRequirements());
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("invalid_upto_profile");
  });

  it("rejects a profile other than contract in the requirements", async () => {
    const result = await scheme.verify(
      basePayload(),
      baseRequirements({ extra: { areFeesSponsored: true, uptoProfile: "stateless" } })
    );
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("invalid_upto_profile");
  });

  it("rejects a settlement contract that doesn't match this instance's configured one", async () => {
    const result = await scheme.verify(
      basePayload(),
      baseRequirements({
        extra: {
          areFeesSponsored: true,
          uptoProfile: "contract",
          settlementContract: "CDIFFERENTCONTRACTADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        },
      })
    );
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("invalid_upto_stellar_wrong_settlement_contract");
  });

  it("rejects a payload with no transaction field", async () => {
    const result = await scheme.verify(basePayload({ payload: {} }), baseRequirements());
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("invalid_upto_stellar_payload_malformed");
  });

  it("rejects a payload whose transaction field isn't valid XDR", async () => {
    const result = await scheme.verify(basePayload(), baseRequirements());
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("invalid_upto_stellar_payload_malformed");
  });
});

describe("UptoStellarScheme.settle: fails closed on the same structural rejections", () => {
  const scheme = new UptoStellarScheme([fakeSigner()], {
    "stellar:testnet": SETTLEMENT_CONTRACT,
  });

  it("never reaches the network for a payload that fails _verify's structural checks", async () => {
    const result = await scheme.settle(basePayload({ x402Version: 1 }), baseRequirements());
    expect(result.success).toBe(false);
    expect(result.errorReason).toBe("invalid_x402_version");
    expect(result.transaction).toBe("");
  });
});
