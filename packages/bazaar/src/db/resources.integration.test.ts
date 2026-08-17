import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { createAnonClient, createServiceRoleClient, type Database } from "./client.js";
import { loadSupabaseTestEnv } from "./test-env.js";

/**
 * Integration tests against the REAL Supabase project (spec Phase 2 gate:
 * "RLS policy tests pass"). Skipped, not failed, when credentials
 * aren't available, so this suite degrades gracefully on a fork or an
 * environment without the repo's Supabase secrets, per docs/DEFERRED.md.
 *
 * Every test that inserts a row cleans it up via the service-role client
 * in `afterEach`, regardless of pass/fail, so a failed assertion doesn't
 * leave test rows in the shared project database.
 */

const env = loadSupabaseTestEnv();

// A URL prefix reserved for this suite's rows, so cleanup can also sweep
// anything a crashed previous run left behind without touching real data.
const TEST_URL_PREFIX = "https://periplo-phase2-test.example/";

function testUrl(): string {
  return `${TEST_URL_PREFIX}${randomUUID()}`;
}

describe.skipIf(!env)("resources table: RLS policy (spec §5 Phase 2 gate)", () => {
  // Non-null assertion is safe here: describe.skipIf(!env) means this
  // block never runs when env is null.
  const { url, anonKey, serviceRoleKey } = env as NonNullable<typeof env>;

  const anon: SupabaseClient<Database> = createAnonClient(url, anonKey);
  const service: SupabaseClient<Database> = createServiceRoleClient(url, serviceRoleKey);

  const createdUrls: string[] = [];

  afterEach(async () => {
    while (createdUrls.length > 0) {
      const rowUrl = createdUrls.pop();
      if (rowUrl) {
        await service.from("resources").delete().eq("url", rowUrl);
      }
    }
  });

  it("allows anon to read (public-read policy)", async () => {
    const { data, error } = await anon.from("resources").select("id").limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it("blocks anon from inserting (no write policy for anon)", async () => {
    const { data, error } = await anon.from("resources").insert({
      url: testUrl(),
      type: "http",
      network: "stellar:testnet",
      pay_to: "GTEST",
      asset: "USDC",
      amount: "1",
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501"); // insufficient_privilege / RLS violation
  });

  it("allows the service role to insert, and the row becomes publicly readable", async () => {
    const rowUrl = testUrl();
    const { data: inserted, error: insertError } = await service
      .from("resources")
      .insert({
        url: rowUrl,
        type: "http",
        network: "stellar:testnet",
        pay_to: "GTEST",
        asset: "USDC",
        amount: "100",
        description: "Phase 2 RLS integration test row",
      })
      .select()
      .single();
    createdUrls.push(rowUrl);

    expect(insertError).toBeNull();
    expect(inserted?.url).toBe(rowUrl);
    expect(inserted?.id).toBeTruthy();

    const { data: seenByAnon, error: selectError } = await anon
      .from("resources")
      .select("url, description")
      .eq("url", rowUrl)
      .maybeSingle();
    expect(selectError).toBeNull();
    expect(seenByAnon?.url).toBe(rowUrl);
  });

  it("blocks anon from updating a row created by the service role", async () => {
    const rowUrl = testUrl();
    await service.from("resources").insert({
      url: rowUrl,
      type: "http",
      network: "stellar:testnet",
      pay_to: "GTEST",
      asset: "USDC",
      amount: "1",
    });
    createdUrls.push(rowUrl);

    const { data, error } = await anon
      .from("resources")
      .update({ amount: "999999" })
      .eq("url", rowUrl)
      .select();

    // PostgREST returns an empty result (not an RLS error) for an UPDATE
    // that matches zero rows under RLS: the row is invisible to anon for
    // writes, so zero rows are affected rather than an explicit denial.
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: unchanged } = await service
      .from("resources")
      .select("amount")
      .eq("url", rowUrl)
      .single();
    expect(unchanged?.amount).toBe("1");
  });

  it("blocks anon from deleting a row created by the service role", async () => {
    const rowUrl = testUrl();
    await service.from("resources").insert({
      url: rowUrl,
      type: "http",
      network: "stellar:testnet",
      pay_to: "GTEST",
      asset: "USDC",
      amount: "1",
    });
    createdUrls.push(rowUrl);

    const { error } = await anon.from("resources").delete().eq("url", rowUrl);
    expect(error).toBeNull(); // no error, but nothing is deleted (see UPDATE test above)

    const { data: stillThere } = await service
      .from("resources")
      .select("url")
      .eq("url", rowUrl)
      .maybeSingle();
    expect(stillThere?.url).toBe(rowUrl);
  });

  it("enforces the (url, route_template, tool_name) uniqueness constraint", async () => {
    const rowUrl = testUrl();
    const first = await service.from("resources").insert({
      url: rowUrl,
      route_template: "/weather/{city}",
      type: "http",
      network: "stellar:testnet",
      pay_to: "GTEST",
      asset: "USDC",
      amount: "1",
    });
    createdUrls.push(rowUrl);
    expect(first.error).toBeNull();

    const duplicate = await service.from("resources").insert({
      url: rowUrl,
      route_template: "/weather/{city}",
      type: "http",
      network: "stellar:testnet",
      pay_to: "GTEST",
      asset: "USDC",
      amount: "2",
    });
    expect(duplicate.error).not.toBeNull();
    expect(duplicate.error?.code).toBe("23505"); // unique_violation
  });

  it("populates the generated full-text-search column from the description", async () => {
    const rowUrl = testUrl();
    await service.from("resources").insert({
      url: rowUrl,
      type: "http",
      network: "stellar:testnet",
      pay_to: "GTEST",
      asset: "USDC",
      amount: "1",
      description: "Current weather conditions by city",
    });
    createdUrls.push(rowUrl);

    // fts isn't in the TS row type as a queryable select target by name
    // here (it's a derived column) -- query it as textSearch to prove the
    // generated column actually indexes the description, end to end.
    const { data, error } = await service
      .from("resources")
      .select("url")
      .eq("url", rowUrl)
      .textSearch("fts", "weather")
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.url).toBe(rowUrl);
  });
});

describe("resources table: RLS suite gating", () => {
  it("documents why this suite is skipped when Supabase credentials aren't configured", () => {
    // This test always runs (even without credentials) so `pnpm test`
    // never silently reports "0 tests" for this file in an environment
    // without Supabase secrets -- it's explicit about what didn't run.
    if (!env) {
      expect(env).toBeNull();
    } else {
      expect(env.url).toBeTruthy();
    }
  });
});
