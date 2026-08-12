# `x402.org`: discovery endpoints (Bazaar extension probe)

- **Captured:** 2026-08-07T05:23:50Z
- **Commands:**
  - `curl -sS -D - -o - https://x402.org/facilitator/discovery/resources`
  - `curl -sS -D - -o - "https://x402.org/facilitator/discovery/search?q=weather"`
- **Result:** `404 Not Found` on both, served as a generic Next.js/Vercel 404
  page (`text/html`), not a JSON error body.

## `GET /facilitator/discovery/resources`: response headers (verbatim)

```
HTTP/2 404
date: Fri, 07 Aug 2026 05:23:50 GMT
content-type: text/html; charset=utf-8
cf-ray: a273d9fedae6a65e-QRO
cf-cache-status: DYNAMIC
access-control-allow-origin: *
age: 6445
cache-control: public, max-age=0, must-revalidate
content-disposition: inline; filename="404"
x-vercel-id: sfo1::dlgjz-1786080230254-99d2155c6d09
x-vercel-cache: HIT
last-modified: Fri, 07 Aug 2026 03:36:25 GMT
server: cloudflare
strict-transport-security: max-age=63072000; includeSubDomains; preload
vary: accept-encoding
x-matched-path: /404
```

Body: generic Next.js 404 HTML page (not reproduced here, no informational
content beyond the status code). `GET /facilitator/discovery/search?q=weather`
returns the identical shape (`404`, same `x-matched-path: /404`).

## Why this transcript matters

Master spec §5 Phase 0: *"Do the same against other multi-chain facilitators
claiming Stellar support. Advertised support and reachable support are not the
same thing, and any gap you document is evidence of conformance discipline."*

This isn't a gap in Stellar support specifically: it's confirmation that the
**Bazaar discovery surface itself doesn't exist yet** on the public reference
facilitator, for any chain. Cross-checked against `supported.md` in this same
directory: `extensions` there lists `builder-code`, `eip2612GasSponsoring`,
`erc20ApprovalGasSponsoring`, no `bazaar`. The two facts agree: no advertised
extension, no reachable endpoint.

This is the empirical basis for master spec §0's framing that discovery is
"solved nowhere yet" and for `docs/INTEROP.md` (Phase 4) needing a different
reference point than x402.org for Bazaar-specific interop comparison, since
there is currently nothing to diff against here.
