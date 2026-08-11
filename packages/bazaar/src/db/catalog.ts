/**
 * Automatic cataloging write path (spec Phase 4): turns a validated bazaar
 * discovery extension into a row in the `resources` table.
 *
 * Deliberately separate from `client.ts` (client construction only) and
 * from `apps/facilitator/src/discovery.ts` (extraction + validation, which
 * lives in the facilitator app because it needs `@x402/extensions/bazaar`
 * and the wire-level `PaymentPayload`/`PaymentRequirements` types — this
 * module only knows about the catalog's own shape, not the x402 wire
 * format, so it stays reusable by anything that already has a normalized
 * `CatalogResourceInput`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ResourceInsert, ResourceRow } from "./client.js";

/**
 * One entry of a resource's `accepts` array — the payment option that was
 * actually used for the request being cataloged. Mirrors `PaymentRequirements`
 * from `@x402/core/types`, kept as a local shape so this module doesn't need
 * to depend on `@x402/core` just for a type.
 */
export interface CatalogAcceptsEntry {
  readonly scheme: string;
  readonly network: string;
  readonly asset: string;
  readonly amount: string;
  readonly payTo: string;
  readonly maxTimeoutSeconds: number;
  readonly extra?: Record<string, unknown>;
}

export interface CatalogResourceInput {
  /** Canonical resource URL — origin + routeTemplate for dynamic HTTP routes, origin + pathname otherwise, or `mcp://tool/{toolName}` for MCP. */
  readonly url: string;
  readonly routeTemplate: string | null;
  readonly toolName: string | null;
  readonly type: "http" | "mcp";
  readonly description: string | null;
  /** Schema-agnostic (spec Phase 1): the declared JSON schema for input/output, descriptions included. */
  readonly parameters: Record<string, unknown>;
  readonly accept: CatalogAcceptsEntry;
  readonly extensionKeys: readonly string[];
}

function dedupeKey(entry: CatalogAcceptsEntry): string {
  return `${entry.scheme}|${entry.network}|${entry.asset}|${entry.payTo}`;
}

/**
 * Merges a new `accepts` entry into whatever the existing row already has,
 * replacing any prior entry with the same (scheme, network, asset, payTo)
 * rather than accumulating duplicates across repeated payments for the same
 * option.
 */
export function mergeAccepts(
  existing: readonly unknown[],
  next: CatalogAcceptsEntry
): CatalogAcceptsEntry[] {
  const nextKey = dedupeKey(next);
  const kept = existing.filter((entry): entry is CatalogAcceptsEntry => {
    if (!entry || typeof entry !== "object") return false;
    const candidate = entry as Partial<CatalogAcceptsEntry>;
    if (
      typeof candidate.scheme !== "string" ||
      typeof candidate.network !== "string" ||
      typeof candidate.asset !== "string" ||
      typeof candidate.payTo !== "string"
    ) {
      return false;
    }
    return dedupeKey(candidate as CatalogAcceptsEntry) !== nextKey;
  });
  return [...kept, next];
}

/**
 * Reads the existing row matching the catalog key (if any), merges the new
 * `accepts` entry into it, and upserts. The unique constraint is
 * `unique nulls not distinct (url, route_template, tool_name)` — Postgres's
 * plain `UNIQUE` treats two NULLs as distinct, which would let two HTTP
 * listings sharing (url, route_template) with tool_name NULL both insert
 * instead of colliding, so the `.is()`/`.eq()` split below matters: a plain
 * `.eq("route_template", null)` is not the same query PostgREST-side.
 */
export async function upsertCatalogResource(
  client: SupabaseClient<Database>,
  input: CatalogResourceInput
): Promise<void> {
  let query = client.from("resources").select("accepts").eq("url", input.url);
  query =
    input.routeTemplate === null
      ? query.is("route_template", null)
      : query.eq("route_template", input.routeTemplate);
  query =
    input.toolName === null ? query.is("tool_name", null) : query.eq("tool_name", input.toolName);

  const { data: existing, error: readError } = await query.maybeSingle();
  if (readError) {
    throw new Error(`Failed to read existing catalog row: ${readError.message}`);
  }

  const existingAccepts = (existing as Pick<ResourceRow, "accepts"> | null)?.accepts ?? [];
  const accepts = mergeAccepts(existingAccepts, input.accept);

  const row: ResourceInsert = {
    url: input.url,
    route_template: input.routeTemplate,
    tool_name: input.toolName,
    type: input.type,
    network: input.accept.network,
    pay_to: input.accept.payTo,
    asset: input.accept.asset,
    amount: input.accept.amount,
    description: input.description,
    parameters: input.parameters,
    accepts,
    extensions: input.extensionKeys,
  };

  const { error: writeError } = await client
    .from("resources")
    .upsert(row, { onConflict: "url,route_template,tool_name" });
  if (writeError) {
    throw new Error(`Failed to upsert catalog row: ${writeError.message}`);
  }
}
