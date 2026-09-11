/**
 * Buyer/agent SDK helper (spec §3 row 5, `packages/helpers`): a library
 * client wrapping the discover (search the Bazaar) -> pay -> retry loop,
 * for use outside an MCP runtime. Named explicitly by an SCF #45 panel
 * review finding, alongside the seller-side helper `paid-resource.ts`.
 *
 * Independent of, and built ahead of, `docs/SPEC.md` Phase 7 (the MCP
 * discovery server, `packages/mcp`, not started, spec §3): this is the
 * library form of the same discover-pay-retry loop Phase 7's own
 * `call_paid_service` MCP tool will eventually wrap, not a companion to
 * an MCP server that doesn't exist in this repo yet (a premise corrected
 * before scoping this work, `docs/DEFERRED.md`'s roadmap section).
 *
 * The pay/retry mechanics are generalized from
 * `apps/facilitator/src/browser/demo-play-client.ts`, the one place in
 * this repo that already proved this exact wire flow live, twice: once
 * from Node (`scripts/demo-play-full-verify.ts`) and once from a real
 * browser (`scripts/demo-play-browser-verify.mjs`). Same header names
 * (`PAYMENT-SIGNATURE` request, `payment-required`/`payment-response`
 * response), same x402 v2 semantics. Unlike that browser bundle (which
 * hand-rolls its own base64 encode/decode because it deliberately avoids
 * importing `@x402/core/types` into browser-bundled code), this module
 * runs in Node and uses `@x402/core/http`'s own
 * `encodePaymentSignatureHeader`/`decodePaymentRequiredHeader`/
 * `decodePaymentResponseHeader` directly, the same helpers
 * `scripts/demo-resource-settle.ts` already uses, rather than
 * reimplementing header encoding a third way. `@x402/stellar/exact/client`'s
 * `ExactStellarScheme` still builds and signs the actual payment: this
 * module orchestrates the HTTP round-trips around it, it does not
 * reimplement scheme signing.
 *
 * Scope, stated honestly: v1 supports the `exact` scheme on Stellar
 * networks only, matching every real resource this repo has ever paid
 * (`demo-resource.ts`). `upto` needs a different, contract-aware client
 * signing path (`UptoStellarScheme`'s own client-side counterpart, which
 * `@x402/stellar` does not currently publish) and is out of scope here.
 * "Retry" means retrying the *whole* discover/pay cycle a bounded number
 * of times on a transient failure (a network error, or a 5xx on the
 * paid retry itself, since a stale signed payload should never be
 * replayed against a fresh 402), never retrying silently past a
 * definitive rejection (4xx, or no acceptable payment option at all).
 */

import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";
import type {
  DiscoveryResource,
  SearchDiscoveryResourcesParams,
  SearchDiscoveryResourcesResponse,
} from "@x402/extensions/bazaar";

export class NoAcceptablePaymentOptionError extends Error {
  override readonly name = "NoAcceptablePaymentOptionError";
}

export class NoDiscoverableResourceError extends Error {
  override readonly name = "NoDiscoverableResourceError";
}

export class PaymentFailedError extends Error {
  override readonly name = "PaymentFailedError";
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class UnexpectedResponseError extends Error {
  override readonly name = "UnexpectedResponseError";
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * What `payAndFetch` needs to build and sign a complete payment payload
 * from a server's full `PaymentRequired` 402 challenge. Deliberately
 * structural, not a nominal wrapper: a real `x402Client` instance (via
 * `createExactStellarPayer`) satisfies this without adaptation, and a
 * test can pass a fake with no Stellar key at all.
 *
 * Takes the whole `PaymentRequired` object, not just one selected
 * `PaymentRequirements`, and returns a complete `PaymentPayload` rather
 * than a partial one this module would then assemble itself: a first
 * version of this interface called the scheme's own lower-level
 * `createPaymentPayload(x402Version, requirements)` directly and
 * hand-assembled `{ ...built, accepted: requirements }`, which builds a
 * payload with no `resource` field. A resource server's own bazaar
 * cataloging (`apps/facilitator/src/discovery.ts`'s `processBazaarExtension`)
 * requires `paymentPayload.resource.url` and rejects (cleanly, not a
 * crash, but the resource silently never gets cataloged) without it,
 * found live running `payAndFetch` against a resource that catalogs.
 * `x402Client.createPaymentPayload` (`@x402/core/client`, the same class
 * `scripts/demo-resource-settle.ts` already uses) builds the complete
 * payload, `resource` included, so this interface now mirrors its real
 * signature instead of a narrower one this module invented.
 */
export interface PaymentPayer {
  /** The CAIP-2 network this payer signs for, e.g. "stellar:testnet". */
  readonly network: string;
  createPaymentPayload(paymentRequired: PaymentRequired): Promise<PaymentPayload>;
}

export interface BuyerFetchResult {
  readonly status: number;
  readonly body: unknown;
  /** `false` when the resource returned something other than a 402 on the
   * first request and no payment was ever attempted (e.g. it's free). */
  readonly paid: boolean;
  readonly settlement?: SettleResponse;
}

export interface PayAndFetchOptions {
  readonly fetchImpl?: typeof fetch;
  /** Total attempts at the whole discover/pay cycle, including the first.
   * Defaults to 1 (no retry). Only a transient failure (network error, or
   * a 5xx on the paid retry) is retried; a definitive rejection is not. */
  readonly maxAttempts?: number;
  readonly retryDelayMs?: number;
}

/** Picks the first Stellar `exact` payment option matching `network`.
 * Pure, no I/O: the same selection `payAndFetch` and `discoverPayAndFetch`
 * both need, exposed so a caller can implement its own selection instead. */
export function selectExactStellarRequirement(
  accepts: readonly PaymentRequirements[],
  network: string
): PaymentRequirements | undefined {
  return accepts.find((a) => a.scheme === "exact" && a.network === network);
}

function isRetryableStatus(status: number): boolean {
  return status >= 500;
}

async function sleep(ms: number): Promise<void> {
  if (ms > 0) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Requests `resourceUrl`, pays for it with `payer` if it 402s, and
 * retries once with the signed payment attached. Throws
 * `NoAcceptablePaymentOptionError` if the 402 challenge has no `exact`
 * option for `payer.network`, `PaymentFailedError` if the paid retry
 * itself is rejected (a definitive failure, not retried), and
 * `UnexpectedResponseError` for any other non-2xx/402 first response.
 */
export async function payAndFetch(
  resourceUrl: string,
  payer: PaymentPayer,
  options: PayAndFetchOptions = {}
): Promise<BuyerFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxAttempts = options.maxAttempts ?? 1;
  const retryDelayMs = options.retryDelayMs ?? 0;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await attemptPayAndFetch(resourceUrl, payer, fetchImpl);
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof UnexpectedResponseError
          ? isRetryableStatus(error.status)
          : error instanceof PaymentFailedError
            ? isRetryableStatus(error.status)
            : !(error instanceof NoAcceptablePaymentOptionError);
      if (!retryable || attempt === maxAttempts) {
        throw error;
      }
      await sleep(retryDelayMs);
    }
  }
  // Unreachable given maxAttempts >= 1, but keeps the function's return
  // type honest without a non-null assertion.
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function attemptPayAndFetch(
  resourceUrl: string,
  payer: PaymentPayer,
  fetchImpl: typeof fetch
): Promise<BuyerFetchResult> {
  const firstResponse = await fetchImpl(resourceUrl);
  if (firstResponse.status !== 402) {
    if (!firstResponse.ok) {
      throw new UnexpectedResponseError(
        `Expected 200 or 402 from ${resourceUrl}, got ${firstResponse.status}`,
        firstResponse.status
      );
    }
    return { status: firstResponse.status, body: await safeJson(firstResponse), paid: false };
  }

  const paymentRequiredHeader = firstResponse.headers.get("payment-required");
  if (!paymentRequiredHeader) {
    throw new UnexpectedResponseError(
      `${resourceUrl} returned 402 with no payment-required header`,
      402
    );
  }
  const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);
  const requirements = selectExactStellarRequirement(paymentRequired.accepts, payer.network);
  if (!requirements) {
    throw new NoAcceptablePaymentOptionError(
      `${resourceUrl} offered no "exact" payment option for ${payer.network} ` +
        `(offered: ${paymentRequired.accepts.map((a) => `${a.scheme}/${a.network}`).join(", ")})`
    );
  }

  const paymentPayload = await payer.createPaymentPayload(paymentRequired);
  const paymentSignatureHeader = encodePaymentSignatureHeader(paymentPayload);

  const paidResponse = await fetchImpl(resourceUrl, {
    headers: { "PAYMENT-SIGNATURE": paymentSignatureHeader },
  });
  const body = await safeJson(paidResponse);
  if (!paidResponse.ok) {
    const reason =
      body && typeof body === "object"
        ? ((body as { error?: string; errorReason?: string }).error ??
          (body as { error?: string; errorReason?: string }).errorReason)
        : undefined;
    throw new PaymentFailedError(
      reason ?? `Paid request to ${resourceUrl} failed with ${paidResponse.status}`,
      paidResponse.status
    );
  }

  const paymentResponseHeader = paidResponse.headers.get("payment-response");
  const settlement = paymentResponseHeader
    ? decodePaymentResponseHeader(paymentResponseHeader)
    : undefined;

  return {
    status: paidResponse.status,
    body,
    paid: true,
    ...(settlement ? { settlement } : {}),
  };
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * `GET {facilitatorBaseUrl}/discovery/search`, the same route
 * `discovery-routes.ts` serves, reusing `@x402/extensions/bazaar`'s own
 * response type rather than redefining the wire shape.
 */
export async function searchBazaar(
  facilitatorBaseUrl: string,
  params: SearchDiscoveryResourcesParams,
  fetchImpl: typeof fetch = fetch
): Promise<SearchDiscoveryResourcesResponse> {
  const query = new URLSearchParams();
  query.set("query", params.query);
  if (params.type !== undefined) query.set("type", params.type);
  if (params.payTo !== undefined) query.set("payTo", params.payTo);
  if (params.scheme !== undefined) query.set("scheme", params.scheme);
  if (params.network !== undefined) query.set("network", params.network);
  if (params.extensions !== undefined) query.set("extensions", params.extensions);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.cursor !== undefined) query.set("cursor", params.cursor);

  const url = `${facilitatorBaseUrl.replace(/\/$/, "")}/discovery/search?${query.toString()}`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new UnexpectedResponseError(`${url} returned ${response.status}`, response.status);
  }
  return (await response.json()) as SearchDiscoveryResourcesResponse;
}

/** The first search result carrying an `exact` option for `payer.network`,
 * in the order the facilitator ranked them. Pure given the response. */
export function selectPayableResource(
  results: SearchDiscoveryResourcesResponse,
  network: string
): DiscoveryResource | undefined {
  return results.resources.find((r) => selectExactStellarRequirement(r.accepts, network));
}

/**
 * Builds the actual URL to request for a discovered resource, appending
 * any `queryParams` its own declared bazaar extension carries.
 *
 * Real, non-obvious mechanic this exists to work around, found running
 * `discoverPayAndFetch` against a real deployed resource, not assumed:
 * `resource.resource` is a *canonical* URL. `@x402/extensions/bazaar`'s
 * own `extractDiscoveryInfo` builds it as `${url.origin}${url.pathname}`
 * unconditionally (a query string is never part of a resource's
 * canonical discovery identity, by upstream's own design, confirmed
 * reading the real compiled source, not assumed from behavior), so it
 * never carries the query parameters a GET-style resource's actual
 * handler may require. Those parameters are exactly what the resource's
 * own declared `extensions.bazaar.info.input.queryParams` documents
 * (the same example a seller built via `definePaidResource` would
 * declare, `paid-resource.ts`): reading them back here is what actually
 * closes the seller-helper/buyer-helper loop, not a URL munging hack.
 * Falls back to the bare canonical URL when a resource declares no
 * query-param example (an unparameterized resource, or an MCP tool,
 * where a query string wouldn't mean anything anyway).
 */
export function resolveResourceRequestUrl(resource: DiscoveryResource): string {
  const bazaar = resource.extensions?.bazaar;
  if (!bazaar || typeof bazaar !== "object") {
    return resource.resource;
  }
  const info = (bazaar as { info?: unknown }).info;
  if (!info || typeof info !== "object") {
    return resource.resource;
  }
  const input = (info as { input?: unknown }).input;
  if (!input || typeof input !== "object") {
    return resource.resource;
  }
  const { type, queryParams } = input as { type?: unknown; queryParams?: unknown };
  if (type !== "http" || !queryParams || typeof queryParams !== "object") {
    return resource.resource;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParams as Record<string, unknown>)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `${resource.resource}?${query}` : resource.resource;
}

/**
 * The full loop this module exists for: search the Bazaar, pick the
 * highest-ranked result this `payer` can actually pay for, pay it, retry
 * with the signed payment. Throws `NoDiscoverableResourceError` if no
 * search result offers a payable option at all.
 */
export async function discoverPayAndFetch(
  facilitatorBaseUrl: string,
  query: string,
  payer: PaymentPayer,
  options: PayAndFetchOptions = {}
): Promise<BuyerFetchResult & { resource: DiscoveryResource }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const results = await searchBazaar(facilitatorBaseUrl, { query }, fetchImpl);
  const resource = selectPayableResource(results, payer.network);
  if (!resource) {
    throw new NoDiscoverableResourceError(
      `No resource matching "${query}" at ${facilitatorBaseUrl} offers an "exact" ` +
        `option for ${payer.network} (${results.resources.length} result(s) found)`
    );
  }
  const result = await payAndFetch(resolveResourceRequestUrl(resource), payer, options);
  return { ...result, resource };
}
