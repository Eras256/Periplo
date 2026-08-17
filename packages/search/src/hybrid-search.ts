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
  });
  if (error) {
    throw new Error(`periplo_hybrid_search failed: ${error.message}`);
  }
  return data ?? [];
}
