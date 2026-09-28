import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { describe, expect, it } from "vitest";
import {
  buildUptoRequirements,
  settleUptoUsage,
  UptoSettlementExceedsCeilingError,
  UptoSettlementFailedError,
  verifyUptoPayment,
} from "./upto-seller.js";

const CEILING: PaymentRequirements = buildUptoRequirements({
  network: "stellar:testnet",
  payTo: "GCYZRDWKRTJCQJYDUHP24TQZXD76ATEVSQIHKVAGMDBRR2KH4DEKFY5T",
  asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  settlementContract: "CA7OYVXWPSQHXNBWJQZ7TCKQILAVBHWDAPNRJTKY66LHR5K5LFXRV6TW",
  maxAmount: 1_000_000n,
});

const PAYLOAD = { x402Version: 2, accepted: CEILING, payload: {} } as PaymentPayload;

describe("buildUptoRequirements", () => {
  it("carries the ceiling as amount and the contract profile in extra", () => {
    expect(CEILING.scheme).toBe("upto");
    expect(CEILING.amount).toBe("1000000");
    expect(CEILING.extra.uptoProfile).toBe("contract");
    expect(CEILING.extra.settlementContract).toBe(
      "CA7OYVXWPSQHXNBWJQZ7TCKQILAVBHWDAPNRJTKY66LHR5K5LFXRV6TW"
    );
  });
});

describe("settleUptoUsage", () => {
  it("rejects an amount above the ceiling before calling the facilitator", async () => {
    const error = await settleUptoUsage(PAYLOAD, CEILING, 1_000_001n, {
      facilitatorBaseUrl: "https://example.test",
      facilitatorClient: {
        settle: () => {
          throw new Error("must not be called: the ceiling check should reject first");
        },
        verify: () => {
          throw new Error("unused");
        },
      },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UptoSettlementExceedsCeilingError);
    expect((error as UptoSettlementExceedsCeilingError).code).toBe(
      "upto_settlement_exceeds_ceiling"
    );
  });

  it("rejects a negative amount", async () => {
    const error = await settleUptoUsage(PAYLOAD, CEILING, -1n, {
      facilitatorBaseUrl: "https://example.test",
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UptoSettlementExceedsCeilingError);
  });

  it("settles for real usage at or below the ceiling, amount overridden to the real usage", async () => {
    let seenAmount: string | undefined;
    const result = await settleUptoUsage(PAYLOAD, CEILING, 400_000n, {
      facilitatorBaseUrl: "https://example.test",
      facilitatorClient: {
        settle: (_payload, requirements) => {
          seenAmount = requirements.amount;
          return Promise.resolve({
            success: true,
            transaction: "abc123",
            network: "stellar:testnet",
            amount: requirements.amount,
          } as SettleResponse);
        },
        verify: () => {
          throw new Error("unused");
        },
      },
    });
    expect(seenAmount).toBe("400000");
    expect(result.success).toBe(true);
  });

  it("throws UptoSettlementFailedError, carrying the facilitator's reason, on failure", async () => {
    const error = await settleUptoUsage(PAYLOAD, CEILING, 100n, {
      facilitatorBaseUrl: "https://example.test",
      facilitatorClient: {
        settle: () =>
          Promise.resolve({
            success: false,
            errorReason: "settle_upto_stellar_transaction_failed",
            transaction: "",
            network: "stellar:testnet",
          } as SettleResponse),
        verify: () => {
          throw new Error("unused");
        },
      },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UptoSettlementFailedError);
    expect((error as UptoSettlementFailedError).code).toBe("upto_settlement_failed");
    expect((error as UptoSettlementFailedError).errorReason).toBe(
      "settle_upto_stellar_transaction_failed"
    );
  });
});

describe("verifyUptoPayment", () => {
  it("delegates to the facilitator client's verify", async () => {
    const result = await verifyUptoPayment(PAYLOAD, CEILING, {
      facilitatorBaseUrl: "https://example.test",
      facilitatorClient: {
        verify: () => Promise.resolve({ isValid: true, payer: "GABC" }),
        settle: () => {
          throw new Error("unused");
        },
      },
    });
    expect(result.isValid).toBe(true);
  });
});
