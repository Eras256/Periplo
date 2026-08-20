import type { Database } from "@periplo/bazaar";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { hybridSearch } from "./hybrid-search.js";

/** Fake client capturing exactly what `.rpc()` was called with, so this stays fast and model-free. */
function fakeClient(
  response: { data: unknown; error: { message: string } | null },
  onCall: (fn: string, args: unknown) => void
): SupabaseClient<Database> {
  return {
    rpc: (fn: string, args: unknown) => {
      onCall(fn, args);
      return Promise.resolve(response);
    },
  } as unknown as SupabaseClient<Database>;
}

describe("hybridSearch", () => {
  it("calls periplo_hybrid_search with the right defaults and a JSON-stringified embedding", async () => {
    let capturedFn = "";
    let capturedArgs: unknown;
    const client = fakeClient({ data: [], error: null }, (fn, args) => {
      capturedFn = fn;
      capturedArgs = args;
    });

    await hybridSearch(client, { query: "weather", queryEmbedding: [0.1, 0.2, 0.3] });

    expect(capturedFn).toBe("periplo_hybrid_search");
    expect(capturedArgs).toEqual({
      search_query: "weather",
      query_embedding: "[0.1,0.2,0.3]",
      match_count: 20,
      match_offset: 0,
      full_text_weight: 1.0,
      semantic_weight: 1.0,
      rrf_k: 50,
    });
  });

  it("passes through explicit overrides", async () => {
    let capturedArgs: unknown;
    const client = fakeClient({ data: [], error: null }, (_fn, args) => {
      capturedArgs = args;
    });

    await hybridSearch(client, {
      query: "translate",
      queryEmbedding: [1, 2],
      limit: 5,
      offset: 10,
      fullTextWeight: 2.0,
      semanticWeight: 0.5,
      rrfK: 20,
    });

    expect(capturedArgs).toMatchObject({
      match_count: 5,
      match_offset: 10,
      full_text_weight: 2.0,
      semantic_weight: 0.5,
      rrf_k: 20,
    });
  });

  it("omits min_semantic_similarity by default, so the SQL function's own default governs", async () => {
    let capturedArgs: unknown;
    const client = fakeClient({ data: [], error: null }, (_fn, args) => {
      capturedArgs = args;
    });

    await hybridSearch(client, { query: "weather", queryEmbedding: [0.1] });

    expect(capturedArgs).not.toHaveProperty("min_semantic_similarity");
  });

  it("passes through an explicit minSemanticSimilarity override", async () => {
    let capturedArgs: unknown;
    const client = fakeClient({ data: [], error: null }, (_fn, args) => {
      capturedArgs = args;
    });

    await hybridSearch(client, {
      query: "weather",
      queryEmbedding: [0.1],
      minSemanticSimilarity: 0.6,
    });

    expect(capturedArgs).toMatchObject({ min_semantic_similarity: 0.6 });
  });

  it("returns the rows verbatim on success", async () => {
    const rows = [{ id: "1", url: "https://example.com", score: 0.5 }];
    const client = fakeClient({ data: rows, error: null }, () => {});
    const result = await hybridSearch(client, { query: "x", queryEmbedding: [1] });
    expect(result).toEqual(rows);
  });

  it("returns an empty array when data is null", async () => {
    const client = fakeClient({ data: null, error: null }, () => {});
    const result = await hybridSearch(client, { query: "x", queryEmbedding: [1] });
    expect(result).toEqual([]);
  });

  it("throws with the Postgres error message on failure", async () => {
    const client = fakeClient(
      { data: null, error: { message: "function does not exist" } },
      () => {}
    );
    await expect(hybridSearch(client, { query: "x", queryEmbedding: [1] })).rejects.toThrow(
      /function does not exist/
    );
  });
});
