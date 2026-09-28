import { describe, expect, it } from "vitest";
import { ASSET_CONTRACT_ID, knownAssetCode, USDC_CONTRACT_ID } from "./contract.js";

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
