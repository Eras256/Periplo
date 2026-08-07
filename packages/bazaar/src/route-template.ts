/**
 * `routeTemplate` validation — the catalog trust boundary (spec Phase 1).
 *
 * The facilitator is a trust boundary: a client echoes its own `resource`
 * block (including `routeTemplate`) back into the payment payload, so a
 * hostile client can attempt to poison the catalog with a crafted template
 * — path traversal, an absolute URL, a protocol-relative path, or the same
 * attack hidden behind percent-encoding.
 *
 * The rule that makes this safe: **decode fully, THEN validate.** A naive
 * `template.includes("..")` is walked straight past by `%2e%2e`, and a
 * single decode pass is walked past by double encoding (`%252e%252e`). So:
 * decode repeatedly up to a bound, normalise backslashes (literal or
 * `%5c`-encoded) to forward slashes, and only then run the traversal /
 * absolute-URL / protocol-relative checks — all against the fully-decoded
 * form.
 *
 * **Catalog storage never uses the decoded form.** This module answers
 * "is the client-supplied string safe to accept", nothing more — callers
 * must store the caller's ORIGINAL `routeTemplate` (this function's input)
 * as the catalog key. Two different percent-encodings of what decodes to
 * the same path are, deliberately, two different catalog entries; folding
 * them onto one would let a later, differently-encoded listing silently
 * overwrite an earlier one.
 */

export interface RouteTemplateCheckResult {
  readonly valid: boolean;
  /** Non-null exactly when `valid` is false (spec §1: every rejection carries a reason). */
  readonly reason: string | null;
}

/** Repeated-decode bound: catches double/triple encoding without an unbounded loop. */
const MAX_DECODE_ITERATIONS = 8;

interface DecodeOutcome {
  readonly decoded: string;
  readonly error: string | null;
}

function percentDecodeFully(input: string): DecodeOutcome {
  let current = input;
  for (let i = 0; i < MAX_DECODE_ITERATIONS; i++) {
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      return { decoded: current, error: "routeTemplate contains malformed percent-encoding" };
    }
    if (next === current) {
      return { decoded: current, error: null };
    }
    current = next;
  }
  // Still changing after MAX_DECODE_ITERATIONS passes: a legitimate route
  // template never needs encoding this deep. Rather than accept a value we
  // haven't finished decoding (and so haven't finished checking), reject it —
  // the depth itself is the signal.
  return { decoded: current, error: "routeTemplate exceeds maximum percent-encoding depth" };
}

function ok(): RouteTemplateCheckResult {
  return { valid: true, reason: null };
}

function reject(reason: string): RouteTemplateCheckResult {
  return { valid: false, reason };
}

/**
 * Validates a client-supplied `routeTemplate`. Accepts `unknown` — the
 * value crosses the trust boundary as untyped JSON, so a hostile client
 * sending a non-string is exactly the kind of input this must handle, not
 * assume away with a `string` parameter type.
 */
export function checkRouteTemplate(routeTemplate: unknown): RouteTemplateCheckResult {
  if (typeof routeTemplate !== "string") {
    return reject("routeTemplate must be a string");
  }
  if (routeTemplate.length === 0) {
    return reject("routeTemplate must not be empty");
  }

  const { decoded, error } = percentDecodeFully(routeTemplate);
  if (error) {
    return reject(error);
  }

  if (decoded.includes("\0")) {
    return reject("routeTemplate contains a null byte");
  }

  // CR/LF in a value that may later be reflected into a header or log line
  // enables injection independent of path-traversal concerns (spec §6:
  // injection via resource metadata). Cheap to reject here.
  if (/[\r\n]/.test(decoded)) {
    return reject("routeTemplate contains a carriage-return or line-feed character");
  }

  // Normalise backslashes (literal or revealed by decoding %5c) to forward
  // slashes BEFORE the traversal check, so "..\\" and "..%5c" are caught by
  // the same rule as "../".
  const normalised = decoded.replaceAll("\\", "/");

  if (normalised.includes("..")) {
    return reject("routeTemplate contains a path traversal segment");
  }

  if (!normalised.startsWith("/")) {
    // Rejects absolute URLs (`https://...`, `javascript:...`) and any
    // template that isn't a root-relative path in one rule, since none of
    // those start with a single "/".
    return reject('routeTemplate must be a root-relative path (must start with "/")');
  }

  if (normalised.startsWith("//")) {
    // Protocol-relative ("//evil.example/x") — a browser or HTTP client
    // resolves this as an absolute URL to another host. This is also what
    // catches the disguised case: "/%2f%2fevil.example" decodes to
    // "///evil.example", which starts with "//".
    return reject('routeTemplate must not be protocol-relative (must not start with "//")');
  }

  return ok();
}
