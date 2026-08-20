/**
 * Calls `periplo_hybrid_search` (the RRF fusion function,
 * `supabase/migrations/20260812080000_search.sql`). This module only knows
 * how to call it: the embedding for the query text is the caller's job
 * (via `embedQuery`), so this stays testable against a fake client without
 * needing the model loaded.
 */

import type { Database, HybridSearchRow } from "@periplo/bazaar";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface HybridSearchParams {
  readonly query: string;
  readonly queryEmbedding: readonly number[];
  readonly limit?: number;
  readonly offset?: number;
  readonly fullTextWeight?: number;
  readonly semanticWeight?: number;
  readonly rrfK?: number;
  /**
   * Minimum cosine similarity (embeddings are L2-normalized, so this is a
   * plain cosine floor, not a distance) a row's embedding must clear to
   * enter the semantic leg at all. Without this, the nearest embedded row
   * is always returned regardless of true relevance: with a small catalog
   * that degrades to "return the one resource that has an embedding, for
   * any query," a real bug found live (`supabase/migrations/
   * 20260820100000_search_relevance_floor.sql`). The first calibration
   * attempt (0.8) shipped in that same migration regressed nDCG@10 50%
   * against the real `eval/golden.jsonl` catalog, since true-positive
   * similarities there go as low as 0.625; corrected to 0.6 in
   * `20260820110000_fix_semantic_floor_regression.sql`, which also has
   * the honest limitation this floor doesn't fully solve: no single
   * global cutoff both keeps that recall and suppresses every reported
   * false positive. Left unset by default so the SQL function's own
   * default (0.6, that migration) governs; overridable here for callers
   * who've calibrated their own catalog differently.
   */
  readonly minSemanticSimilarity?: number;
}

export type HybridSearchResult = HybridSearchRow & { readonly score: number };

export async function hybridSearch(
  client: SupabaseClient<Database>,
  params: HybridSearchParams
): Promise<HybridSearchResult[]> {
  const { data, error } = await client.rpc("periplo_hybrid_search", {
    search_query: params.query,
    // pgvector reads a JSON-array string over PostgREST: there's no
    // native array-of-float wire type for it.
    query_embedding: JSON.stringify(params.queryEmbedding),
    match_count: params.limit ?? 20,
    match_offset: params.offset ?? 0,
    full_text_weight: params.fullTextWeight ?? 1.0,
    semantic_weight: params.semanticWeight ?? 1.0,
    rrf_k: params.rrfK ?? 50,
    ...(params.minSemanticSimilarity !== undefined
      ? { min_semantic_similarity: params.minSemanticSimilarity }
      : {}),
  });
  if (error) {
    throw new Error(`periplo_hybrid_search failed: ${error.message}`);
  }
  return data ?? [];
}
