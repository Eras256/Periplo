import type { Database, ResourceRow } from "@periplo/bazaar";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { listDiscoveryResources, searchDiscoveryResources } from "./discovery-routes.js";

/**
 * Fake `.from("resources").select()...` chain, capturing every filter call
 * so tests can assert on them without a real Postgres. Every method
 * returns the same chainable object; `.then()` makes it directly
 * `await`-able like the real postgrest-js builder.
 */
function fakeListClient(
  rows: Partial<ResourceRow>[],
  total: number,
  onCall: (method: string, args: unknown[]) => void
): SupabaseClient<Database> {
  const builder: Record<string, unknown> = {};
  const chain =
    (method: string) =>
    (...args: unknown[]) => {
      onCall(method, args);
      return builder;
    };
  builder.select = chain("select");
  builder.order = chain("order");
  builder.range = chain("range");
  builder.eq = chain("eq");
  builder.contains = chain("contains");
  // biome-ignore lint/suspicious/noThenProperty: intentional, mirrors the real postgrest-js query builder, which is itself thenable so `await query` works with no trailing terminal call.
  builder.then = (resolve: (v: { data: unknown; error: null; count: number }) => void) =>
    resolve({ data: rows, error: null, count: total });
  return { from: () => builder } as unknown as SupabaseClient<Database>;
}

/** Same pattern as `packages/search/src/hybrid-search.test.ts`'s fake. */
function fakeRpcClient(
  rows: unknown[],
  onCall?: (fn: string, args: unknown) => void
): SupabaseClient<Database> {
  return {
    rpc: (fn: string, args: unknown) => {
      onCall?.(fn, args);
      return Promise.resolve({ data: rows, error: null });
    },
  } as unknown as SupabaseClient<Database>;
}

function row(overrides: Partial<ResourceRow> = {}): Partial<ResourceRow> {
  return {
    url: "https://seller.example/weather",
    type: "http",
    network: "stellar:testnet",
    pay_to: "GPAYTO",
    accepts: [{ scheme: "exact", network: "stellar:testnet", asset: "CASSET", amount: "1000" }],
    extensions: ["bazaar"],
    last_updated: "2026-08-07T12:00:00.000Z",
    description: "Current conditions by city",
    ...overrides,
  };
}

describe("listDiscoveryResources", () => {
  it("maps rows to the DiscoveryResource wire shape", async () => {
    const client = fakeListClient([row()], 1, () => {});
    const result = await listDiscoveryResources({ client }, {});

    expect(result.x402Version).toBe(2);
    expect(result.pagination).toEqual({ limit: 50, offset: 0, total: 1 });
    expect(result.items).toEqual([
      {
        resource: "https://seller.example/weather",
        type: "http",
        x402Version: 2,
        accepts: row().accepts,
        lastUpdated: "2026-08-07T12:00:00.000Z",
        description: "Current conditions by city",
        extensions: { bazaar: {} },
      },
    ]);
  });

  it("omits description and extensions when the row has neither", async () => {
    const client = fakeListClient([row({ description: null, extensions: [] })], 1, () => {});
    const result = await listDiscoveryResources({ client }, {});
    expect(result.items[0]).not.toHaveProperty("description");
    expect(result.items[0]).not.toHaveProperty("extensions");
  });

  it("applies type/payTo/network/extensions filters as eq/contains calls", async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const client = fakeListClient([], 0, (method, args) => calls.push({ method, args }));

    await listDiscoveryResources(
      { client },
      { type: "mcp", payTo: "GPAYTO", network: "stellar:testnet", extensions: "bazaar" }
    );

    expect(calls).toContainEqual({ method: "eq", args: ["type", "mcp"] });
    expect(calls).toContainEqual({ method: "eq", args: ["pay_to", "GPAYTO"] });
    expect(calls).toContainEqual({ method: "eq", args: ["network", "stellar:testnet"] });
    expect(calls).toContainEqual({ method: "contains", args: ["extensions", ["bazaar"]] });
  });

  it("passes limit/offset through to range and pagination", async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const client = fakeListClient([], 3, (method, args) => calls.push({ method, args }));

    const result = await listDiscoveryResources({ client }, { limit: 10, offset: 20 });

    expect(calls).toContainEqual({ method: "range", args: [20, 29] });
    expect(result.pagination).toEqual({ limit: 10, offset: 20, total: 3 });
  });
});

describe("searchDiscoveryResources", () => {
  it("embeds the query and returns ranked results as DiscoveryResource[]", async () => {
    const client = fakeRpcClient([{ ...row(), score: 0.9 }]);
    const result = await searchDiscoveryResources({ client }, { query: "weather" }, [0.1, 0.2]);

    expect(result.x402Version).toBe(2);
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]?.resource).toBe("https://seller.example/weather");
    expect(result.partialResults).toBe(false);
  });

  it("post-filters ranked results that don't match type/payTo/network/extensions", async () => {
    const client = fakeRpcClient([
      { ...row({ type: "http" }), score: 0.9 },
      { ...row({ type: "mcp", url: "mcp://tool/geocode" }), score: 0.8 },
    ]);
    const result = await searchDiscoveryResources(
      { client },
      { query: "weather", type: "mcp" },
      [0.1]
    );

    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]?.resource).toBe("mcp://tool/geocode");
  });

  it("sets partialResults when the SQL side returned a full page (pre-filter truncation)", async () => {
    const fullPage = Array.from({ length: 20 }, (_, i) =>
      row({ url: `https://seller.example/${i}` })
    ).map((r) => ({ ...r, score: 1 }));
    const client = fakeRpcClient(fullPage);

    const result = await searchDiscoveryResources({ client }, { query: "weather" }, [0.1]);

    expect(result.partialResults).toBe(true);
    expect(result.pagination?.cursor).not.toBeNull();
  });

  it("decodes an opaque cursor back into an offset for the next page", async () => {
    let capturedArgs: unknown;
    const client = fakeRpcClient([], (_fn, args) => {
      capturedArgs = args;
    });
    const cursor = Buffer.from("40", "utf8").toString("base64");

    await searchDiscoveryResources({ client }, { query: "weather", cursor }, [0.1]);

    expect(capturedArgs).toMatchObject({ match_offset: 40 });
  });
});
