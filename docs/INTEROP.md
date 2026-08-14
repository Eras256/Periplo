# Interop: Stellar bazaar listings vs. the canonical wire spec

Spec `docs/SPEC.md` §5 Phase 4: *"A Stellar listing must be representable
consistently with how other facilitators represent theirs. Take the
transcripts captured in Phase 0, diff your catalog entries against how the
same resource appears in a multi-chain facilitator's index, and record any
divergence."*

No live multi-chain facilitator has a queryable discovery index to diff
against. Phase 0's baseline probe against `x402.org`, the reference
facilitator this whole project's conformance work is measured against,
confirmed a flat `404` on both `/discovery/resources` and
`/discovery/search`, with no discovery endpoints deployed at all
(`conformance/baseline/x402-org/discovery-404.md`). No other facilitator
known to this build has a live, reachable Bazaar index.

So the diff below is against the next best thing, and arguably the more
authoritative one: the canonical wire spec itself. That means
`@x402/extensions/bazaar` (the official TypeScript implementation, pinned
at the same `2.21.0` this repo already pins for `@x402/core`/`@x402/stellar`)
and `e2e/extensions/bazaar.ts` (the x402 project's own conformance test for
this exact extension). `docs/SPEC.md` §4 names this file directly as the
authority: "these shapes are validated by `e2e/extensions/bazaar.ts`."
Reading it and the package it validates against is diffing against the
multi-chain reference, just not through a live HTTP probe.

## 1. `routeTemplate` validation is intentionally stricter than upstream

Both Periplo and `@x402/extensions/bazaar` treat `routeTemplate` as
client-controlled and validate it at the facilitator. This is a
trust-boundary principle both implementations share: upstream's own
`isValidRouteTemplate` doc comment describes exactly the same
catalog-poisoning concern `packages/bazaar/src/route-template.ts` was built
against in Phase 1. Where they diverge:

| | Periplo (`checkRouteTemplate`) | `@x402/extensions/bazaar` (`isValidRouteTemplate`) |
| --- | --- | --- |
| Percent-decoding | Repeated, bounded (8 passes), catches double/triple encoding | Single pass; `%252e%252e` (double-encoded `..`) survives as a literal string and passes |
| Backslash normalization | `\` and `%5c` both normalized to `/` before the traversal check | Not normalized |
| Null bytes / CR / LF | Rejected explicitly | Not checked |
| On failure | The whole extension is rejected (`EXTENSION-RESPONSES: { status: "rejected", rejectedReason }`), no catalog row | `extractDiscoveryInfo` silently omits the invalid `routeTemplate` and continues cataloging under the unparameterized URL |

Periplo's behavior is the one spec Phase 4's gate requires: a crafted
hostile `routeTemplate` must produce a rejected header and no row. So
`apps/facilitator/src/discovery.ts` calls `@periplo/bazaar`'s own
`checkRouteTemplate` instead of upstream's `isValidRouteTemplate` for this
one check. Everything else in the request, schema validation,
protocol-shape validation, and info extraction, still goes through the
official package unmodified. This is the one place in Phase 4 where "build
on the official SDK" was not the full story, documented here rather than
left as a silent divergence.

This gap is worth filing upstream; it has not been filed yet. Filing a
GitHub issue on a repository this project does not own is an outward-facing
action, flagged per working rules and held for confirmation rather than
done unilaterally. The single-decode gap is a real, if narrow,
catalog-poisoning surface for anyone using `isValidRouteTemplate` directly.
`%252e%252e%252f` decodes once to `%2e%2e%2f`, which still passes the `..`
check because that check runs on the once-decoded string, and only fully
resolves to `../` on a second decode, which upstream never performs.

## 2. `mcp://tool/{toolName}` URLs break upstream's own canonical-URL logic

We found this through the real Supabase integration test
(`apps/facilitator/src/discovery.integration.test.ts`), not by reading the
code. The first attempt at cataloging an MCP resource produced a row with
`url: "null/financial_analysis_xyz"` instead of
`"mcp://tool/financial_analysis_xyz"`.

Root cause: `extractDiscoveryInfo` builds the catalog URL as
`` `${url.origin}${url.pathname}` `` when no `routeTemplate` is present.
The MCP path always takes this branch, since MCP tools are never
parameterized. `mcp:` is not a WHATWG special scheme (only
`http`/`https`/`ws`/`wss`/`ftp`/`file` are). Per the URL spec, a
`mcp://tool/x` URL gets an opaque origin, and `URL.prototype.origin`
serializes an opaque origin as the literal string `"null"`:

```
> new URL("mcp://tool/financial_analysis_xyz").origin
'null'
```

`docs/SPEC.md` §4 documents `mcp://tool/{toolName}` as the *expected*
resource URL form for MCP resources, the exact input that trips this. Every
implementation that follows the documented convention without
special-casing non-special schemes will hit the same bug.

Workaround, in `apps/facilitator/src/discovery.ts`: for MCP resources, the
catalog URL is reconstructed directly as `` `mcp://tool/${toolName}` `` from
the extension's own `toolName` field, rather than trusting
`discovered.resourceUrl`. `toolName` does not go through `URL` parsing, so
the origin bug does not affect it.

**Filed upstream:**
[x402-foundation/x402#3121](https://github.com/x402-foundation/x402/issues/3121).
The issue includes a minimal reproduction (both via `extractDiscoveryInfo`
directly and via bare `new URL(...).origin`), the environment, and a
suggested fix: skip `URL` parsing for the MCP branch and build
`` `mcp://tool/${toolName}` `` from the extension's own `toolName`
directly, the same as the workaround here. It is filed as a bug report,
not a spec PR. `CONTRIBUTING.md`'s "issue before spec" requirement is for
spec changes; a bug report is lighter-weight and is explicitly one of the
two things GitHub issues are for in that document.

**Fix status, updated 2026-08-14**: a fix is open as
[x402-foundation/x402#3138](https://github.com/x402-foundation/x402/pull/3138),
built scheme-agnostic per whawk46's suggested shape rather than an
`mcp://`-specific patch, with a regression test on a second, unrelated
made-up scheme. whawk46 reviewed it and separately found a real
follow-on gap in the fix itself: the opaque-origin branch skipped the
query/fragment stripping the function exists to do, reintroducing the
same per-variant catalog duplication that stripping prevents. We
implemented the fix they suggested for it (`${url.protocol}//${url.host}${url.pathname}`)
with a new regression test, and they reviewed that too: "LGTM as it
stands — merge-ready from my side" (quoted verbatim). The PR is open,
mergeable, reviewed twice by the person who reported the original bug,
blocked only on a maintainer's approval to merge, not on anything left
for this project to do.

## 3. `docs/SPEC.md` §4's `GET /discovery/search` param name is wrong

`docs/SPEC.md` §4 was written before this phase, from a wire-contract
description rather than the source, and says the search endpoint takes a
`q` parameter. The real wire uses `query`. That is confirmed by both the
official client's `SearchDiscoveryResourcesParams`
(`@x402/extensions/bazaar`'s `facilitatorClient.ts`) and the x402 e2e
test's own probe (`e2e/extensions/bazaar.ts`'s `validateSearchEndpoint`,
which builds `?query=<term>`). Phase 0's own baseline probe against
`x402.org` (`conformance/baseline/x402-org/discovery-404.md`) used
`?q=weather` too, but that request 404'd regardless, since no discovery
endpoints exist there, so it never had a chance to surface this.

`ListDiscoveryResourcesParams` also documents a `scheme` filter (alongside
`type`, `payTo`, `network`, `extensions`, `limit`, `offset`) that
`docs/SPEC.md` §4's filter list omits.

This is not corrected in `docs/SPEC.md` yet. `GET /discovery/resources` and
`GET /discovery/search` are Phase 5 (search) work, not built in Phase 4. It
is recorded here now, while the primary source was open, so Phase 5 starts
from the right param name instead of re-deriving it.

## Sources

- `@x402/extensions/bazaar@2.21.0`: `facilitator.ts`, `facilitatorClient.ts`,
  `http/types.ts`, `mcp/types.ts` (installed at
  `node_modules/@x402/extensions`, same pin as `@x402/core`/`@x402/stellar`).
- `e2e/extensions/bazaar.ts`,
  [`x402-foundation/x402`](https://github.com/x402-foundation/x402) `main`
  branch, read directly via the GitHub API rather than assumed from
  `docs/SPEC.md`'s prose description.
