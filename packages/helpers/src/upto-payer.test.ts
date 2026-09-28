import { Keypair } from "@stellar/stellar-sdk";
import type { PaymentRequired } from "@x402/core/types";
import { describe, expect, it, vi } from "vitest";
import { type PaymentPayer, payAndFetch } from "./buyer-client.js";
import {
  createUptoStellarPayer,
  NoUptoPaymentOptionError,
  SpendingCeilingExceededError,
  selectUptoStellarRequirement,
  UptoMainnetNotSupportedError,
} from "./upto-payer.js";

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf-8").toString("base64");
}

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
) {
  const headers = new Headers(init.headers ?? {});
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers,
    json: async () => body,
  } as Response;
}

const NETWORK = "stellar:testnet";
const SECRET = Keypair.random().secret();

function challenge(overrides: Partial<PaymentRequired["accepts"][number]> = {}): PaymentRequired {
  return {
    x402Version: 2,
    resource: { url: "https://example.test/resource" },
    accepts: [
      {
        scheme: "upto",
        network: NETWORK,
        asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
        amount: "1000000",
        payTo: "GCYZRDWKRTJCQJYDUHP24TQZXD76ATEVSQIHKVAGMDBRR2KH4DEKFY5T",
        maxTimeoutSeconds: 60,
        extra: {
          areFeesSponsored: true,
          uptoProfile: "contract",
          settlementContract: "CA7OYVXWPSQHXNBWJQZ7TCKQILAVBHWDAPNRJTKY66LHR5K5LFXRV6TW",
        },
        ...overrides,
      },
    ],
  };
}

describe("selectUptoStellarRequirement", () => {
  it("picks the upto/contract option for the given network", () => {
    const found = selectUptoStellarRequirement(challenge().accepts, NETWORK);
    expect(found?.scheme).toBe("upto");
  });

  it("ignores an exact option and a wrong-network option", () => {
    const accepts = [
      { ...challenge().accepts[0], scheme: "exact" },
      { ...challenge().accepts[0], network: "stellar:pubnet" },
    ] as PaymentRequired["accepts"];
    expect(selectUptoStellarRequirement(accepts, NETWORK)).toBeUndefined();
  });

  it("ignores an upto option missing the contract profile", () => {
    const accepts = [
      { ...challenge().accepts[0], extra: { uptoProfile: "stateless" } },
    ] as PaymentRequired["accepts"];
    expect(selectUptoStellarRequirement(accepts, NETWORK)).toBeUndefined();
  });
});

describe("createUptoStellarPayer", () => {
  it("throws UptoMainnetNotSupportedError for any non-testnet network", () => {
    expect(() =>
      createUptoStellarPayer(SECRET, "stellar:pubnet", {
        facilitatorBaseUrl: "https://example.test",
        maxSpendPerAuthorization: 1_000_000n,
      })
    ).toThrow(UptoMainnetNotSupportedError);
  });

  it("rejects a ceiling above maxSpendPerAuthorization before any network call", async () => {
    const payer = createUptoStellarPayer(SECRET, NETWORK, {
      facilitatorBaseUrl: "https://example.test",
      maxSpendPerAuthorization: 500_000n,
      facilitatorClient: {
        getSupported: () => {
          throw new Error("must not be called: the ceiling check should reject first");
        },
      },
    });
    const error = await payer.createPaymentPayload(challenge()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpendingCeilingExceededError);
    expect((error as SpendingCeilingExceededError).code).toBe("upto_spending_ceiling_exceeded");
    expect((error as SpendingCeilingExceededError).message).not.toBe("");
  });

  it("throws NoUptoPaymentOptionError when the challenge offers no upto/contract option", async () => {
    const payer = createUptoStellarPayer(SECRET, NETWORK, {
      facilitatorBaseUrl: "https://example.test",
      maxSpendPerAuthorization: 10_000_000n,
    });
    const noUpto: PaymentRequired = { ...challenge(), accepts: [] };
    const error = await payer.createPaymentPayload(noUpto).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NoUptoPaymentOptionError);
    expect((error as NoUptoPaymentOptionError).code).toBe("upto_no_matching_requirement");
  });
});

describe("payAndFetch with an upto payer", () => {
  it("selects the upto requirement, signs, and retries, via selectRequirement", async () => {
    const requirements = challenge().accepts[0];
    if (!requirements) throw new Error("test setup bug");
    const fakeUptoPayer: PaymentPayer = {
      network: NETWORK,
      createPaymentPayload: vi.fn(async (paymentRequired: PaymentRequired) => ({
        x402Version: paymentRequired.x402Version,
        resource: paymentRequired.resource,
        accepted: requirements,
        payload: { transaction: "signed-ceiling-xdr" },
      })),
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(challenge(), {
          status: 402,
          headers: { "payment-required": b64(challenge()) },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { generated: "10 rows" },
          {
            status: 200,
            headers: {
              "payment-response": b64({ transaction: "settle-hash", amount: "500000" }),
            },
          }
        )
      );

    const result = await payAndFetch("https://seller.example/resource", fakeUptoPayer, {
      fetchImpl,
      selectRequirement: selectUptoStellarRequirement,
    });

    expect(result.paid).toBe(true);
    expect(result.settlement).toEqual({ transaction: "settle-hash", amount: "500000" });
    expect(fakeUptoPayer.createPaymentPayload).toHaveBeenCalledTimes(1);
  });
});
