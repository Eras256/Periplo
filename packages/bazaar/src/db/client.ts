/**
 * Typed Supabase client factory for the `resources` catalog table
 * (schema: `supabase/migrations/`, spec Phase 2).
 *
 * Two factories, deliberately not one configurable-by-flag function: the
 * anon client and the service-role client cross the RLS boundary
 * differently (spec §5 Phase 2: "public-read; writes only via the
 * service role"), and callers should have to consciously pick which one
 * they're constructing rather than pass a role string that's easy to get
 * wrong. `createServiceRoleClient` is server-side only, the key it takes
 * bypasses RLS entirely and must never reach a browser bundle (spec §6).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// A `type` alias, deliberately not an `interface`: postgrest-js's generic
// resolution checks `Row extends Record<string, unknown>` in a conditional
// type, and a named `interface` does NOT satisfy that check the way a
// `type` object literal does (verified empirically, an `interface` here
// silently collapses every `.from("resources")` query's inferred type to
// `never` instead of erroring, which is a much more confusing failure than
// a type error would have been). Keep this a `type`.
export type ResourceRow = {
  readonly id: string;
  readonly url: string;
  readonly route_template: string | null;
  readonly tool_name: string | null;
  readonly type: "http" | "mcp";
  readonly network: string;
  readonly pay_to: string;
  readonly asset: string;
  readonly amount: string;
  readonly description: string | null;
  readonly parameters: Record<string, unknown>;
  readonly accepts: readonly unknown[];
  readonly extensions: readonly string[];
  /**
   * The actual declared extension object per key in `extensions` above
   * (e.g. `{ bazaar: { info: {...}, schema: {...} } }`), verbatim as
   * `discovery.ts`'s `processBazaarExtension` validated it. `extensions`
   * itself only ever tracked which keys applied, never their payloads;
   * this is that missing half, what `DiscoveryResource.extensions` in
   * `@x402/extensions/bazaar` documents as "Extension payloads echoed
   * from discovery." A resource cataloged before this column existed
   * defaults to `{}` here until its next payment re-catalogs it.
   */
  readonly extension_payloads: Record<string, unknown>;
  readonly last_updated: string;
  readonly embedding: readonly number[] | null;
};

/**
 * The only columns that are NOT NULL with no default (see
 * supabase/migrations/*_resources.sql), everything else is either
 * DB-generated (id, last_updated, fts) or nullable (route_template,
 * tool_name, description, embedding) or has a DB default (parameters,
 * accepts, extensions), so it's fine to omit any of those on insert.
 */
type ResourceRequiredInsertFields = "url" | "type" | "network" | "pay_to" | "asset" | "amount";

export type ResourceInsert = Pick<ResourceRow, ResourceRequiredInsertFields> &
  Partial<Omit<ResourceRow, ResourceRequiredInsertFields>>;

/**
 * Row shape `periplo_hybrid_search` returns (spec Phase 5,
 * `supabase/migrations/20260812080000_search.sql`), everything from
 * `ResourceRow` except `id` (still a string, just not re-declared) and
 * `embedding` (never returned by the search function), plus the fused
 * RRF `score`.
 */
export type HybridSearchRow = Omit<ResourceRow, "embedding">;

// Also a `type`, not an `interface`, see the note on ResourceRow above;
// keeping the whole schema declared the same way avoids relearning this
// the hard way if another nested type gets added later.
export type Database = {
  public: {
    Tables: {
      resources: {
        Row: ResourceRow;
        Insert: ResourceInsert;
        Update: Partial<ResourceRow>;
        // postgrest-js's GenericTable requires this even though the
        // schema has no foreign keys today, verified against the
        // installed @supabase/postgrest-js@2.112.2 types: omitting it (or
        // omitting Views/Functions below) makes .from() resolve to `never`
        // rather than erroring, which is a much more confusing failure.
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      periplo_hybrid_search: {
        Args: {
          search_query: string;
          // pgvector accepts a JSON-array string ("[0.1,0.2,...]") over
          // PostgREST, there's no native array-of-float wire type for it.
          query_embedding: string;
          match_count?: number;
          match_offset?: number;
          full_text_weight?: number;
          semantic_weight?: number;
          rrf_k?: number;
        };
        Returns: (HybridSearchRow & { score: number })[];
      };
    };
  };
};

/**
 * Public-read client. Safe to use anywhere the anon key is safe to use
 * (spec §6: the anon key is RLS-enforced, unlike the service-role key).
 */
export function createAnonClient(url: string, anonKey: string): SupabaseClient<Database> {
  return createClient<Database>(url, anonKey, { auth: { persistSession: false } });
}

/**
 * Bypasses RLS entirely. Server-side only: this is exactly the key
 * spec §2's Phase 2 schema note and spec §6 warn against ever shipping to
 * a browser.
 */
export function createServiceRoleClient(
  url: string,
  serviceRoleKey: string
): SupabaseClient<Database> {
  return createClient<Database>(url, serviceRoleKey, { auth: { persistSession: false } });
}
