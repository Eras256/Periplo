import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  type CatalogAcceptsEntry,
  type CatalogResourceInput,
  countCatalogResources,
  InvalidCatalogUrlError,
  mergeAccepts,
  upsertCatalogResource,
} from "./catalog.js";
import type { Database } from "./client.js";

/**
 * Pure-logic unit tests for the `accepts` merge rule. The DB read/upsert
 * side of `upsertCatalogResource` is covered by the real integration test
 * (`resources.integration.test.ts` pattern) since it needs live Supabase:
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

  // Regression coverage for the gap `docs/DEFERRED.md` records: two `upto`
  // profiles for the same scheme/network/asset/payTo used to collide.
  it("keeps distinct entries that differ only by extra.uptoProfile", () => {
    const existing = [entry({ scheme: "upto", extra: { uptoProfile: "contract" } })];
    const result = mergeAccepts(
      existing,
      entry({ scheme: "upto", extra: { uptoProfile: "stateless" } })
    );
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.extra?.uptoProfile).sort()).toEqual(["contract", "stateless"]);
  });

  it("still replaces same scheme/network/asset/payTo/uptoProfile instead of duplicating it", () => {
    const existing = [entry({ scheme: "upto", extra: { uptoProfile: "contract" }, amount: "500" })];
    const result = mergeAccepts(
      existing,
      entry({ scheme: "upto", extra: { uptoProfile: "contract" }, amount: "1000" })
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.amount).toBe("1000");
  });

  it("treats a missing uptoProfile as distinct from a present one, not as a wildcard match", () => {
    const existing = [entry({ scheme: "upto", extra: { uptoProfile: "contract" } })];
    const result = mergeAccepts(existing, entry({ scheme: "upto" }));
    expect(result).toHaveLength(2);
  });
});

/**
 * `upsertCatalogResource` rejecting an invalid `url` (real bad entries
 * found by external QA, see `catalog-url.ts`). Covers only that the check
 * runs, and runs BEFORE any database interaction: a `client.from()` that
 * throws if ever called proves rejection happens pre-emptively, not just
 * that a real write eventually fails. The DB-write half (a rejected url
 * leaves no row) is covered by the real integration test in
 * `apps/facilitator/src/discovery.integration.test.ts`, which needs a live
 * Supabase project this pure unit file deliberately doesn't.
 */
describe("upsertCatalogResource: rejects an invalid url before touching the database", () => {
  function poisonedClient(): SupabaseClient<Database> {
    return {
      from() {
        throw new Error("upsertCatalogResource must reject before calling client.from()");
      },
    } as unknown as SupabaseClient<Database>;
  }

  function input(url: string): CatalogResourceInput {
    return {
      url,
      routeTemplate: null,
      toolName: null,
      type: "http",
      description: null,
      parameters: {},
      accept: entry(),
      extensionKeys: [],
    };
  }

  it("rejects the real bad entry shape (null/*) with InvalidCatalogUrlError", async () => {
    await expect(
      upsertCatalogResource(poisonedClient(), input("null/financial_analysis_x"))
    ).rejects.toBeInstanceOf(InvalidCatalogUrlError);
  });

  it("rejects a non-http(s)/mcp scheme", async () => {
    await expect(
      upsertCatalogResource(poisonedClient(), input("ftp://example.com/x"))
    ).rejects.toBeInstanceOf(InvalidCatalogUrlError);
  });

  it("rejects the real bad entry shape (localhost) with a reason mentioning the host", async () => {
    await expect(
      upsertCatalogResource(poisonedClient(), input("http://localhost:4022/exact/stellar"))
    ).rejects.toMatchObject({ reason: expect.stringMatching(/local host/i) });
  });

  it("lets a well-formed externally reachable url past the check (reaches the poisoned client)", async () => {
    // Proves the check doesn't over-reject: this input gets far enough to
    // hit the DB call, which is exactly what the poisoned client's own
    // error message says.
    await expect(
      upsertCatalogResource(poisonedClient(), input("https://example.com/weather"))
    ).rejects.toThrow("must reject before calling client.from()");
  });
});

describe("countCatalogResources", () => {
  /** Fake `.from("resources").select(..., { count, head })` chain. */
  function fakeCountClient(count: number | null, error: { message: string } | null = null) {
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    // biome-ignore lint/suspicious/noThenProperty: mirrors the real thenable postgrest-js builder, same pattern as discovery-routes.test.ts's fakeListClient.
    builder.then = (
      resolve: (v: { data: null; error: typeof error; count: number | null }) => void
    ) => resolve({ data: null, error, count });
    return { from: () => builder } as unknown as Parameters<typeof countCatalogResources>[0];
  }

  it("returns the real count from PostgREST's response", async () => {
    await expect(countCatalogResources(fakeCountClient(42))).resolves.toBe(42);
  });

  it("returns 0 when PostgREST reports a null count (empty table edge case)", async () => {
    await expect(countCatalogResources(fakeCountClient(null))).resolves.toBe(0);
  });

  it("throws with the real error message when the count query fails", async () => {
    await expect(
      countCatalogResources(fakeCountClient(null, { message: "connection refused" }))
    ).rejects.toThrow(/connection refused/);
  });
});
