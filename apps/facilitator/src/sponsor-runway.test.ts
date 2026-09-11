import { describe, expect, it } from "vitest";
import {
  computeSponsorRunway,
  type HorizonAccount,
  type HorizonTransactionRecord,
  SponsorAccountUnreadableError,
} from "./sponsor-runway.js";

const SPONSOR = "GSPONSOR000000000000000000000000000000000000000000000";
const OTHER = "GOTHER0000000000000000000000000000000000000000000000000";

function account(balanceXlm: string): HorizonAccount {
  return { balances: [{ asset_type: "native", balance: balanceXlm }] };
}

function tx(sourceAccount: string, feeChargedStroops: string): HorizonTransactionRecord {
  return {
    source_account: sourceAccount,
    fee_charged: feeChargedStroops,
    created_at: "2026-09-10T00:00:00Z",
  };
}

describe("computeSponsorRunway", () => {
  it("computes runway from a real burn rate observed in the window", () => {
    // 1,000 XLM balance, 240,000 stroops charged over 24h = 10,000 stroops/hour.
    // 10,000,000,000 stroops / 10,000 per hour = 1,000,000 hours of runway.
    const result = computeSponsorRunway(
      account("1000.0000000"),
      [tx(SPONSOR, "120000"), tx(SPONSOR, "120000")],
      SPONSOR,
      "stellar:testnet",
      24,
      48
    );
    expect(result.balanceStroops).toBe(10_000_000_000);
    expect(result.feeChargedStroopsInWindow).toBe(240_000);
    expect(result.burnRateStroopsPerHour).toBe(10_000);
    expect(result.runwayHours).toBe(1_000_000);
    expect(result.belowThreshold).toBe(false);
  });

  it("flags belowThreshold when projected runway is under the threshold", () => {
    // 1 XLM balance, 500,000 stroops/hour burn (a heavy, bursty window):
    // 10,000,000 stroops / 500,000 per hour = 20 hours, under the 48h threshold.
    const result = computeSponsorRunway(
      account("1.0000000"),
      [tx(SPONSOR, "12000000")],
      SPONSOR,
      "stellar:testnet",
      24,
      48
    );
    expect(result.runwayHours).toBe(20);
    expect(result.belowThreshold).toBe(true);
  });

  it("reports infinite runway when nothing was spent in the window, given a positive balance", () => {
    const result = computeSponsorRunway(
      account("1.0000000"),
      [],
      SPONSOR,
      "stellar:testnet",
      24,
      48
    );
    expect(result.runwayHours).toBe(Number.POSITIVE_INFINITY);
    expect(result.belowThreshold).toBe(false);
  });

  it("treats a zero balance as critical (zero runway) regardless of burn rate", () => {
    const result = computeSponsorRunway(
      account("0.0000000"),
      [],
      SPONSOR,
      "stellar:testnet",
      24,
      48
    );
    expect(result.runwayHours).toBe(0);
    expect(result.belowThreshold).toBe(true);
  });

  it("only counts transactions whose source_account is the sponsor itself", () => {
    const result = computeSponsorRunway(
      account("1000.0000000"),
      [tx(OTHER, "999999999"), tx(SPONSOR, "10000")],
      SPONSOR,
      "stellar:testnet",
      24,
      48
    );
    expect(result.feeChargedStroopsInWindow).toBe(10_000);
  });

  it("throws SponsorAccountUnreadableError when the account has no native balance entry", () => {
    expect(() =>
      computeSponsorRunway({ balances: [] }, [], SPONSOR, "stellar:testnet", 24, 48)
    ).toThrow(SponsorAccountUnreadableError);
  });
});
