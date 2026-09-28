import { describe, expect, it } from "vitest";
import { formatAmount } from "./amount";
import {
  ASSET_CONTRACT_ID,
  knownAssetCode,
  SIMULATION_ASSET_CODE,
  USDC_CONTRACT_ID,
} from "./contract";
import { PRICE_PER_TOKEN } from "./simulation";

describe("knownAssetCode", () => {
  it("labels each asset by its own contract ID", () => {
    expect(knownAssetCode(ASSET_CONTRACT_ID)).toBe("PTEST");
    expect(knownAssetCode(USDC_CONTRACT_ID)).toBe("USDC");
  });

  it("returns undefined for an asset whose decimals are not known", () => {
    expect(
      knownAssetCode("CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
    ).toBeUndefined();
  });
});

describe("simulation asset", () => {
  it("is testnet USDC, the same asset the USDC SAC reports", () => {
    expect(SIMULATION_ASSET_CODE).toBe("USDC");
    expect(knownAssetCode(USDC_CONTRACT_ID)).toBe(SIMULATION_ASSET_CODE);
  });

  it("prices a token at 0.00001 USDC using 7 decimals", () => {
    expect(formatAmount(PRICE_PER_TOKEN)).toBe("0.00001");
    expect(PRICE_PER_TOKEN).toBe(100n);
  });
});
