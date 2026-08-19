/**
 * Automatic cataloging (spec §5 Phase 4): when a `PaymentPayload` carries
 * the bazaar discovery extension, validate it and catalog the resource,
 * no separate registration step. Built on `@x402/extensions/bazaar`
 * (the official extraction/validation logic for this wire extension,
 * matching spec §1's "do not reimplement" spirit applied beyond just
 * verify/settle) rather than reimplementing the extension mechanics here.
 *
 * One deliberate divergence from upstream, documented in `docs/INTEROP.md`:
 * `routeTemplate` is checked with `@periplo/bazaar`'s `checkRouteTemplate`
 * (Phase 1: decode-fully-then-validate, bounded-repeated decoding) instead
 * of `@x402/extensions/bazaar`'s `isValidRouteTemplate` (single decode
 * pass). A hostile `routeTemplate` here hard-rejects the whole extension
 * with a specific reason (spec Phase 4 gate); upstream's own
 * `extractDiscoveryInfo` would instead silently omit an invalid
 * `routeTemplate` and keep going with the unparameterized URL.
 */

import {
  type CatalogAcceptsEntry,
  checkRouteTemplate,
  type Database,
  InvalidCatalogUrlError,
  upsertCatalogResource,
} from "@periplo/bazaar";
import { buildDiscoveryText, embedDocument } from "@periplo/search";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import {
  BAZAAR,
  type DiscoveredResource,
  type DiscoveryExtension,
  extractDiscoveryInfo,
  validateDiscoveryExtension,
  validateDiscoveryExtensionSpec,
} from "@x402/extensions/bazaar";

export interface BazaarExtensionResult {
  readonly status: "success" | "rejected";
  readonly rejectedReason?: string;
}

function rejected(reason: string): BazaarExtensionResult {
  return { status: "rejected", rejectedReason: reason };
}

/**
 * Pulls the per-parameter JSON schema (with descriptions) out of the raw
 * declared extension, distinct from `discoveryInfo` which carries example
 * *values*, not the schema. This is what Phase 5's search embeddings will
 * read from `resources.parameters` (spec §5: "resource description,
 * per-parameter descriptions, and MCP tool schema").
 */
function extractParameters(rawExtension: Record<string, unknown>): Record<string, unknown> {
  const info = rawExtension["info"];
  const infoInput =
    info && typeof info === "object" ? (info as Record<string, unknown>)["input"] : undefined;
  const inputType =
    infoInput && typeof infoInput === "object"
      ? (infoInput as Record<string, unknown>)["type"]
      : undefined;

  if (inputType === "mcp") {
    // MCP: the argument schema is already data (not split into a separate
    // "schema" sibling), `info.input.inputSchema`.
    const inputSchema =
      infoInput && typeof infoInput === "object"
        ? (infoInput as Record<string, unknown>)["inputSchema"]
        : undefined;
    const schema = rawExtension["schema"];
    const output =
      schema && typeof schema === "object"
        ? (schema as Record<string, unknown>)["properties"]
        : undefined;
    return {
      input: inputSchema ?? {},
      ...(output && typeof output === "object"
        ? { output: (output as Record<string, unknown>)["output"] ?? null }
        : {}),
    };
  }

  // HTTP: the schema lives at schema.properties.input (queryParams/pathParams/body),
  // separate from info.input (example values).
  const schema = rawExtension["schema"];
  const properties =
    schema && typeof schema === "object"
      ? (schema as Record<string, unknown>)["properties"]
      : undefined;
  const inputSchema =
    properties && typeof properties === "object"
      ? (properties as Record<string, unknown>)["input"]
      : undefined;
  const outputSchema =
    properties && typeof properties === "object"
      ? (properties as Record<string, unknown>)["output"]
      : undefined;

  return {
    input: inputSchema ?? {},
    ...(outputSchema !== undefined ? { output: outputSchema } : {}),
  };
}

function toCatalogAccept(requirements: PaymentRequirements): CatalogAcceptsEntry {
  return {
    scheme: requirements.scheme,
    network: requirements.network,
    asset: requirements.asset,
    amount: requirements.amount,
    payTo: requirements.payTo,
    maxTimeoutSeconds: requirements.maxTimeoutSeconds,
    ...(requirements.extra ? { extra: requirements.extra } : {}),
  };
}

/**
 * Extracts, validates, and (when a catalog client is configured) persists
 * the bazaar discovery extension declared on a payment. Returns `null`
 * when the payload declares no bazaar extension at all, callers should
 * not emit an `EXTENSION-RESPONSES` header in that case (spec §4: the
 * header reports a cataloging *outcome*; there is none to report).
 *
 * `catalogClient: null` validates without persisting, used by tests and
 * by any deployment that hasn't configured a catalog database (the
 * facilitator core itself has no hard Supabase dependency; only this
 * HTTP-layer cataloging step does).
 */
export async function processBazaarExtension(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
  catalogClient: SupabaseClient<Database> | null
): Promise<BazaarExtensionResult | null> {
  const rawExtensions = paymentPayload.extensions;
  if (!rawExtensions || !(BAZAAR.key in rawExtensions)) {
    return null;
  }

  const rawExt = rawExtensions[BAZAAR.key];
  if (!rawExt || typeof rawExt !== "object" || Array.isArray(rawExt)) {
    return rejected("bazaar extension must be an object");
  }
  const rawExtRecord = rawExt as Record<string, unknown>;

  const specResult = validateDiscoveryExtensionSpec(rawExtRecord);
  if (!specResult.valid) {
    return rejected(specResult.errors?.join("; ") ?? "info failed protocol validation");
  }

  // Trust boundary: routeTemplate is client-echoed and only meaningful for
  // HTTP (see module doc for why this uses Periplo's own checker).
  const routeTemplateRaw = rawExtRecord["routeTemplate"];
  let routeTemplate: string | null = null;
  if (routeTemplateRaw !== undefined) {
    const check = checkRouteTemplate(routeTemplateRaw);
    if (!check.valid) {
      return rejected(check.reason ?? "routeTemplate failed validation");
    }
    routeTemplate = routeTemplateRaw as string;
  }

  const schemaResult = validateDiscoveryExtension(rawExtRecord as unknown as DiscoveryExtension);
  if (!schemaResult.valid) {
    return rejected(schemaResult.errors?.join("; ") ?? "info failed schema validation");
  }

  // extractDiscoveryInfo (v2 path) does `new URL(paymentPayload.resource?.url ?? "")` with
  // no guard: an empty/missing resource.url throws rather than returning null. Caught here
  // so a malformed payload rejects with a reason instead of 500ing the whole /verify or
  // /settle response (spec §1: the facilitator is a trust boundary; every rejection carries
  // a reason, nothing crashes on hostile or merely incomplete input).
  if (paymentPayload.x402Version === 2 && !paymentPayload.resource?.url) {
    return rejected("payload.resource.url is required to catalog a bazaar extension");
  }

  // Already validated above, skip extractDiscoveryInfo's internal
  // (console.warn-only, reason-losing) validation pass.
  let discovered: DiscoveredResource | null;
  try {
    discovered = extractDiscoveryInfo(paymentPayload, paymentRequirements, false);
  } catch (error) {
    return rejected(
      `failed to extract discovery info: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!discovered) {
    return rejected("could not extract discovery info from the payment payload");
  }

  if (!catalogClient) {
    return { status: "success" };
  }

  // `mcp:` is not a WHATWG "special scheme" (unlike http/https), so
  // `new URL("mcp://tool/x").origin` is the opaque-origin string "null",
  // upstream's extractDiscoveryInfo builds its canonicalUrl as
  // `${url.origin}${url.pathname}`, which turns "mcp://tool/x" into
  // "null/x" for exactly the URL form spec §4 documents
  // (`mcp://tool/{toolName}`). Reconstructed directly from `toolName` here
  // instead of trusting `discovered.resourceUrl` for MCP, found via the
  // real Supabase integration test, not assumed; see docs/INTEROP.md.
  //
  // This branches on discovery *type* (mcp vs http, upstream's own
  // DiscoveredResource union), not on the resource URL's scheme, and never
  // calls `new URL()` on the mcp:// string itself, so it was never
  // vulnerable to the opaque-origin bug the way upstream's own code was.
  // Still required at the currently pinned `@x402/extensions@2.21.0`: the
  // upstream fix has a PR open (x402-foundation/x402#3138, closes #3121,
  // scheme-agnostic, skips canonicalization entirely when
  // `url.origin === "null"` instead of an mcp-specific branch) but isn't
  // merged or released yet. Once Periplo upgrades past a release that
  // includes it, `discovered.resourceUrl` will already be correct for MCP
  // resources and this branch collapses to the same
  // `catalogUrl: discovered.resourceUrl` the http case already uses.
  // Check the changelog before removing this. Don't assume the pinned
  // version has it.
  const { type, toolName, catalogRouteTemplate, catalogUrl } =
    "toolName" in discovered
      ? {
          type: "mcp" as const,
          toolName: discovered.toolName,
          catalogRouteTemplate: null,
          catalogUrl: `mcp://tool/${discovered.toolName}`,
        }
      : {
          type: "http" as const,
          toolName: null,
          catalogRouteTemplate: routeTemplate ?? null,
          catalogUrl: discovered.resourceUrl,
        };

  const description = discovered.description ?? null;
  const parameters = extractParameters(rawExtRecord);

  // Semantic embedding (spec Phase 5). Never blocks cataloging: a model
  // load/inference failure here should not stop a payment from being
  // cataloged. Left `undefined` (not `null`) on failure so a transient
  // error on a *repeat* payment doesn't clobber an embedding a prior,
  // successful write already stored; `CatalogResourceInput.embedding`'s
  // doc comment in `packages/bazaar/src/db/catalog.ts` covers why the
  // undefined/null distinction matters at the upsert layer.
  let embedding: number[] | undefined;
  try {
    embedding = await embedDocument(buildDiscoveryText({ description, parameters }));
  } catch (error) {
    console.warn(
      `[bazaar] failed to embed discovery text for ${catalogUrl}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  try {
    await upsertCatalogResource(catalogClient, {
      url: catalogUrl,
      routeTemplate: catalogRouteTemplate,
      toolName,
      type,
      description,
      parameters,
      accept: toCatalogAccept(paymentRequirements),
      extensionKeys: Object.keys(rawExtensions),
      ...(embedding !== undefined ? { embedding } : {}),
    });
  } catch (error) {
    // The write-time URL gate (packages/bazaar/src/catalog-url.ts),
    // enforced inside upsertCatalogResource itself: reported as a normal
    // rejection, same as every other bazaar-extension validation failure
    // above, rather than propagating and 500ing an otherwise-successful
    // /verify or /settle response over a cataloging concern. Any other
    // error (a real database failure) is not this class of problem and
    // still propagates, unchanged from before this check existed.
    if (error instanceof InvalidCatalogUrlError) {
      return rejected(error.reason);
    }
    throw error;
  }

  return { status: "success" };
}
