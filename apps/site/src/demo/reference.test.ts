import { describe, expect, it } from "vitest";
import { EVIDENCE } from "../data/evidence";
import type { ChainSettlement } from "./chain-settlements";
import { USDC_CONTRACT_ID } from "./contract";
import { findReference, REFERENCE_SETTLEMENT_HASH } from "./reference";

const settlement = (overrides: Partial<ChainSettlement>): ChainSettlement => ({
  id: "1",
  settledAt: new Date(0),
  transactionHash: REFERENCE_SETTLEMENT_HASH,
  from: "GA",
  to: "GB",
  asset: USDC_CONTRACT_ID,
  maxAmount: 1_000_000n,
  actualAmount: 500_000n,
  ...overrides,
});

describe("findReference", () => {
  it("finds the reference settlement by hash and asset", () => {
    const found = findReference([
      settlement({ id: "x", transactionHash: "other" }),
      settlement({}),
    ]);
    expect(found?.actualAmount).toBe(500_000n);
  });

  it("returns undefined when the list is null, empty or lacks the hash", () => {
    expect(findReference(null)).toBeUndefined();
    expect(findReference([])).toBeUndefined();
    expect(findReference([settlement({ transactionHash: "other" })])).toBeUndefined();
  });

  it("ignores a matching hash under a different asset", () => {
    expect(findReference([settlement({ asset: "CAAAA" })])).toBeUndefined();
  });

  it("has a static evidence entry to fall back to, in both languages", () => {
    const entry = EVIDENCE.find((item) => item.hash === REFERENCE_SETTLEMENT_HASH);
    expect(entry?.text.en).toContain("USDC");
    expect(entry?.text.es).toContain("USDC");
  });
});
