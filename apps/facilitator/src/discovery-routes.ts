/**
 * `GET /discovery/resources` and `GET /discovery/search` (spec §4).
 *
 * Reuses the official `@x402/extensions/bazaar` response/param types
 * directly, same "don't reimplement the wire protocol" principle as
 * `discovery.ts`'s write path: this module's job is translating
 * `ResourceRow`/`HybridSearchRow` (`packages/bazaar`'s storage shape)
 * into `DiscoveryResource` (the wire shape), not defining the wire shape
 * itself.
 *
 * Both functions take an already-resolved `queryEmbedding`/query params
 * rather than reaching into `packages/search`'s model loading themselves
 * (mirrors `hybridSearch`'s own "the embedding is the caller's job"
 * separation), so unit tests here never load `fastembed`'s real model.
 */

import type { Database, ResourceRow } from "@periplo/bazaar";
import { type HybridSearchResult, hybridSearch } from "@periplo/search";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DiscoveryResource,
  DiscoveryResourcesResponse,
  ListDiscoveryResourcesParams,
  SearchDiscoveryResourcesParams,
  SearchDiscoveryResourcesResponse,
} from "@x402/extensions/bazaar";

const X402_VERSION = 2;

type ResourceLike = Pick<
  ResourceRow,
  "url" | "type" | "accepts" | "last_updated" | "description" | "extensions"
>;

function toDiscoveryResource(row: ResourceLike): DiscoveryResource {
  return {
    resource: row.url,
    type: row.type,
    x402Version: X402_VERSION,
    // Validated on write (discovery.ts's processBazaarExtension path, per
    // spec §1's "don't reimplement verify/settle" extended to bazaar), so
    // this is the same "shape already confirmed" cast app.ts's own
    // toSdkTypes uses, not an escape from validation.
    accepts: row.accepts as DiscoveryResource["accepts"],
    lastUpdated: row.last_updated,
    ...(row.description ? { description: row.description } : {}),
    // The wire shape's `extensions` is a per-extension payload map, but
    // the catalog only stores which extension *keys* applied
    // (`extensions: text[]`, spec §2), not their payloads (those aren't
    // persisted, see discovery.ts), so each key maps to an empty object
    // rather than a fabricated payload.
    ...(row.extensions.length > 0
      ? { extensions: Object.fromEntries(row.extensions.map((key) => [key, {}])) }
      : {}),
  };
}

export interface DiscoveryRoutesDeps {
  readonly client: SupabaseClient<Database>;
}

/**
 * `GET /discovery/resources`: plain filtered listing, no ranking. Filters
 * `type`, `payTo`, `network`, `extensions`, `limit`, `offset`, exactly the
 * columns `supabase/migrations/20260807202307_resources.sql` already
 * indexes for this route (added ahead of this route's own build, per that
 * migration's own comment).
 */
export async function listDiscoveryResources(
  deps: DiscoveryRoutesDeps,
  params: ListDiscoveryResourcesParams
): Promise<DiscoveryResourcesResponse> {
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  let query = deps.client
    .from("resources")
    .select("url, type, network, pay_to, accepts, extensions, last_updated, description", {
      count: "exact",
    })
    .order("last_updated", { ascending: false })
    .range(offset, Math.max(offset, offset + limit - 1));

  // Cast, not a validation gap: an unrecognized `type` value simply
  // matches zero rows at the DB level rather than needing rejection here,
  // same "let Postgres be the source of truth for the filter" posture as
  // the rest of this function.
  if (params.type) query = query.eq("type", params.type as ResourceRow["type"]);
  if (params.payTo) query = query.eq("pay_to", params.payTo);
  if (params.network) query = query.eq("network", params.network);
  if (params.extensions) query = query.contains("extensions", [params.extensions]);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`GET /discovery/resources query failed: ${error.message}`);
  }

  return {
    x402Version: X402_VERSION,
    items: (data ?? []).map(toDiscoveryResource),
    pagination: { limit, offset, total: count ?? 0 },
  };
}

/**
 * `GET /discovery/search`: natural-language ranking via `packages/search`'s
 * hybrid RRF search. `periplo_hybrid_search` (the SQL side) doesn't take
 * type/payTo/network/extensions filters, see its signature in
 * `packages/bazaar/src/db/client.ts`, so those apply as an in-process
 * post-filter over the ranked rows instead of a fifth SQL parameter. A
 * filtered response can therefore return fewer than `limit` results even
 * when more would exist unfiltered; `partialResults` reflects the
 * pre-filter SQL-side truncation only, since that's the only truncation
 * this function can actually detect. Cursor is an opaque base64-encoded
 * offset, not a keyset cursor, the simplest honest choice given the spec's
 * own "the server may ignore this" framing for pagination here.
 */
export async function searchDiscoveryResources(
  deps: DiscoveryRoutesDeps,
  params: SearchDiscoveryResourcesParams,
  queryEmbedding: readonly number[]
): Promise<SearchDiscoveryResourcesResponse> {
  const limit = params.limit ?? 20;
  const offset = decodeCursor(params.cursor);

  const results = await hybridSearch(deps.client, {
    query: params.query,
    queryEmbedding,
    limit,
    offset,
  });

  const filtered = results.filter((row: HybridSearchResult) => {
    if (params.type && row.type !== params.type) return false;
    if (params.payTo && row.pay_to !== params.payTo) return false;
    if (params.network && row.network !== params.network) return false;
    if (params.extensions && !row.extensions.includes(params.extensions)) return false;
    return true;
  });

  return {
    x402Version: X402_VERSION,
    resources: filtered.map(toDiscoveryResource),
    partialResults: results.length === limit,
    pagination: { limit, cursor: encodeCursor(offset + limit, results.length === limit) },
  };
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const decoded = Number.parseInt(Buffer.from(cursor, "base64").toString("utf8"), 10);
  return Number.isFinite(decoded) && decoded >= 0 ? decoded : 0;
}

function encodeCursor(nextOffset: number, hasMore: boolean): string | null {
  if (!hasMore) return null;
  return Buffer.from(String(nextOffset), "utf8").toString("base64");
}
