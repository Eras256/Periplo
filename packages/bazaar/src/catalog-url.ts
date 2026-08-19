/**
 * Catalog `url` validation: the write-time gate for what `db/catalog.ts`'s
 * `upsertCatalogResource` will accept as `resources.url`.
 *
 * Exists because a bad catalog URL reached production by two unrelated
 * paths, found by real external QA (see CLAUDE.md's Architecture section
 * for the full writeup): the `${url.origin}${url.pathname}` opaque-origin
 * bug (`docs/INTEROP.md`, x402-foundation/x402#3121) that turned
 * `mcp://tool/x` into the literal string `null/x` for writes before the
 * reconstruction fix in `apps/facilitator/src/discovery.ts` landed, and a
 * plain `http://localhost:...` URL from local dev/conformance testing that
 * was never an opaque-origin problem at all, just an unreachable host
 * nothing validated against. The first fix only touches how
 * `apps/facilitator/src/discovery.ts` builds the URL for MCP resources; it
 * does nothing for the second class, and neither fix is enforced anywhere
 * a future caller of `upsertCatalogResource` would automatically get it.
 * This module is that enforcement, called from inside
 * `upsertCatalogResource` itself (not just one call site), so it applies
 * regardless of which code path produced the URL.
 */

export interface CatalogUrlCheckResult {
  readonly valid: boolean;
  /** Non-null exactly when `valid` is false (spec §1: every rejection carries a reason). */
  readonly reason: string | null;
}

function ok(): CatalogUrlCheckResult {
  return { valid: true, reason: null };
}

function reject(reason: string): CatalogUrlCheckResult {
  return { valid: false, reason };
}

/**
 * Hostnames rejected outright, plus any `*.local` suffix. Deliberately
 * scoped to exactly the class of failure the two real bad entries
 * represent (a bare `localhost` origin), not generalized to the full
 * 127.0.0.0/8 loopback range or IPv6 (`::1`): matched to a verified real
 * failure mode rather than invented scope (spec §12).
 */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

function isLocalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return LOCAL_HOSTNAMES.has(lower) || lower.endsWith(".local");
}

/**
 * Validates a catalog `url`: the same string `upsertCatalogResource` writes
 * to `resources.url`. Accepts `unknown`, this is the last line of defense
 * before a database write, not a re-validation of already-typed input.
 */
export function checkCatalogUrl(url: unknown): CatalogUrlCheckResult {
  if (typeof url !== "string" || url.length === 0) {
    return reject("catalog url must be a non-empty string");
  }

  // The literal signature of the opaque-origin bug: `${url.origin}...` on
  // an opaque-origin scheme stringifies `origin` as the literal text
  // "null". Checked as a string prefix rather than relying on `new URL()`
  // to reject it (a scheme-less "null/foo" string doesn't reliably throw
  // the same way across inputs); the prefix itself is the actual signature
  // this gate exists to catch.
  if (url === "null" || url.startsWith("null/")) {
    return reject('catalog url is the literal opaque-origin placeholder ("null/...")');
  }

  if (url.startsWith("mcp://")) {
    const match = /^mcp:\/\/tool\/(.+)$/.exec(url);
    if (!match?.[1]) {
      return reject('mcp catalog url must match "mcp://tool/{toolName}"');
    }
    return ok();
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return reject("catalog url must be an absolute http(s) URL or mcp://tool/{toolName}");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return reject(`catalog url scheme "${parsed.protocol}" is not http(s) or mcp`);
  }

  if (isLocalHost(parsed.hostname)) {
    return reject(
      `catalog url host "${parsed.hostname}" is a local host, not externally reachable`
    );
  }

  return ok();
}
