/**
 * Automatic cataloging write path (spec Phase 4): turns a validated bazaar
 * discovery extension into a row in the `resources` table.
 *
 * Deliberately separate from `client.ts` (client construction only) and
 * from `apps/facilitator/src/discovery.ts` (extraction + validation, which
 * lives in the facilitator app because it needs `@x402/extensions/bazaar`
 * and the wire-level `PaymentPayload`/`PaymentRequirements` types: this
 * module only knows about the catalog's own shape, not the x402 wire
 * format, so it stays reusable by anything that already has a normalized
 * `CatalogResourceInput`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { checkCatalogUrl } from "../catalog-url.js";
import type { Database, ResourceInsert, ResourceRow } from "./client.js";

/**
 * Thrown by `upsertCatalogResource` when `input.url` fails
 * `checkCatalogUrl`, before any database call. Distinguished from the
 * plain `Error`s this module throws for a failed read/write so a caller
 * (`apps/facilitator/src/discovery.ts`) can convert this specific case
 * into a normal `{ status: "rejected", rejectedReason }` outcome, the same
 * treatment every other bazaar-extension validation failure already gets,
 * rather than letting an invalid resource URL 500 an otherwise-successful
 * `/verify` or `/settle` response.
 */
export class InvalidCatalogUrlError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Invalid catalog url: ${reason}`);
    this.name = "InvalidCatalogUrlError";
    this.reason = reason;
  }
}

/**
 * One entry of a resource's `accepts` array: the payment option that was
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
  /** Canonical resource URL: origin + routeTemplate for dynamic HTTP routes, origin + pathname otherwise, or `mcp://tool/{toolName}` for MCP. */
  readonly url: string;
  readonly routeTemplate: string | null;
  readonly toolName: string | null;
  readonly type: "http" | "mcp";
  readonly description: string | null;
  /** Schema-agnostic (spec Phase 1): the declared JSON schema for input/output, descriptions included. */
  readonly parameters: Record<string, unknown>;
  readonly accept: CatalogAcceptsEntry;
  readonly extensionKeys: readonly string[];
  /**
   * Semantic embedding (spec Phase 5, `packages/search`) over the
   * discovery text, `null` when the caller has no embedding pipeline
   * configured, or when generating one failed. Cataloging never depends on
   * this: a resource with `embedding: null` is still fully cataloged and
   * findable by lexical search, just not by semantic search until a later
   * write supplies one.
   */
  readonly embedding?: readonly number[] | null;
}

/**
 * `extra.uptoProfile` (spec: `#3098`'s `scheme_upto_stellar.md`) is the
 * wire-level discriminator between conformant `upto` profiles (`contract`
 * vs. `stateless`, see `docs/UPTO-CONVERGENCE.md`). Folded into the key
 * unconditionally, not just when `scheme === "upto"`: including it is
 * always safe (a scheme without a profile, like `exact`, has no
 * `uptoProfile` and the key degrades to the pre-fix shape exactly), and
 * scoping the check to one scheme name would silently regress the moment
 * a second scheme adopts the same discriminator field. Previously found:
 * two `accepts` entries differing only in `extra.uptoProfile` hashed to
 * the same key and silently overwrote each other, see `docs/DEFERRED.md`'s
 * "three real implementation gaps" section.
 */
function dedupeKey(entry: CatalogAcceptsEntry): string {
  const uptoProfile = typeof entry.extra?.uptoProfile === "string" ? entry.extra.uptoProfile : "";
  return `${entry.scheme}|${entry.network}|${entry.asset}|${entry.payTo}|${uptoProfile}`;
}

/**
 * Merges a new `accepts` entry into whatever the existing row already has,
 * replacing any prior entry with the same (scheme, network, asset, payTo,
 * uptoProfile) rather than accumulating duplicates across repeated
 * payments for the same option.
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
 * `unique nulls not distinct (url, route_template, tool_name)`: Postgres's
 * plain `UNIQUE` treats two NULLs as distinct, which would let two HTTP
 * listings sharing (url, route_template) with tool_name NULL both insert
 * instead of colliding, so the `.is()`/`.eq()` split below matters: a plain
 * `.eq("route_template", null)` is not the same query PostgREST-side.
 *
 * Validates `input.url` via `checkCatalogUrl` before any database call
 * (throws `InvalidCatalogUrlError` if it fails): this is the write-time
 * gate the catalog's own data quality depends on, enforced here rather
 * than only at whichever call site happens to construct the URL, so it
 * catches a bad URL regardless of which code path produced it. See
 * `catalog-url.ts` for why this exists (real bad entries found by
 * external QA, documented in CLAUDE.md's Architecture section).
 */
export async function upsertCatalogResource(
  client: SupabaseClient<Database>,
  input: CatalogResourceInput
): Promise<void> {
  const urlCheck = checkCatalogUrl(input.url);
  if (!urlCheck.valid) {
    // Non-null whenever `valid` is false, checkCatalogUrl's own contract.
    throw new InvalidCatalogUrlError(urlCheck.reason as string);
  }

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
    // Omitted entirely (not sent as null) when the caller didn't supply
    // one: PostgREST's upsert only SETs columns present in the payload, so
    // an absent key leaves an existing embedding from a prior payment
    // untouched rather than clobbering it with null on every repeat write.
    ...(input.embedding !== undefined ? { embedding: input.embedding } : {}),
  };

  const { error: writeError } = await client
    .from("resources")
    .upsert(row, { onConflict: "url,route_template,tool_name" });
  if (writeError) {
    throw new Error(`Failed to upsert catalog row: ${writeError.message}`);
  }
}
