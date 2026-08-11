import { describe, expect, it } from "vitest";
import { type CatalogAcceptsEntry, mergeAccepts } from "./catalog.js";

/**
 * Pure-logic unit tests for the `accepts` merge rule. The DB read/upsert
 * side of `upsertCatalogResource` is covered by the real integration test
 * (`resources.integration.test.ts` pattern) since it needs live Supabase —
 * this file covers the part that doesn't.
 */

function entry(overrides: Partial<CatalogAcceptsEntry> = {}): CatalogAcceptsEntry {
  return {
    scheme: "exact",
    network: "stellar:testnet",
    asset: "CASSET",
    amount: "1000",
    payTo: "GPAYTO",
    maxTimeoutSeconds: 60,
    ...overrides,
  };
}

describe("mergeAccepts", () => {
  it("appends a new entry to an empty existing array", () => {
    const result = mergeAccepts([], entry());
    expect(result).toEqual([entry()]);
  });

  it("replaces an existing entry with the same scheme/network/asset/payTo instead of duplicating it", () => {
    const existing = [entry({ amount: "500" })];
    const result = mergeAccepts(existing, entry({ amount: "1000" }));
    expect(result).toHaveLength(1);
    expect(result[0]?.amount).toBe("1000");
  });

  it("keeps distinct entries that differ by network", () => {
    const existing = [entry({ network: "stellar:pubnet" })];
    const result = mergeAccepts(existing, entry({ network: "stellar:testnet" }));
    expect(result).toHaveLength(2);
  });

  it("keeps distinct entries that differ by asset", () => {
    const existing = [entry({ asset: "OTHERASSET" })];
    const result = mergeAccepts(existing, entry({ asset: "CASSET" }));
    expect(result).toHaveLength(2);
  });

  it("drops malformed entries from the existing array rather than throwing", () => {
    const existing = [null, "not-an-object", { scheme: "exact" }, entry({ asset: "KEEPME" })];
    const result = mergeAccepts(existing, entry({ asset: "NEW" }));
    expect(result).toEqual([entry({ asset: "KEEPME" }), entry({ asset: "NEW" })]);
  });
});
