# Privacy and user protection

`docs/SPEC.md` §9: the submission form asks for this explicitly. The
architecture is the answer, not a policy document, and this file states
what's actually true of the running code today, not just the position.

## What Periplo collects: nothing personal, by construction

Grep `apps/facilitator/src/*.ts` yourself: there is no cookie, no
third-party analytics call, no IP-address logging, no request-body
logging. `serve.ts`'s only `console.log`/`console.warn`/`console.error`
calls are process-level boot status and error diagnostics (the port it's
listening on, a facilitator that failed to start, a warm-up failure),
never a payer's identity or a request's contents.

- **No PII.** The facilitator never asks for a name, an email, or any
  identifying field. A payment carries a Stellar public key (`payer`),
  which is a pseudonymous chain address, not personal data by itself.
- **No cookies.** There is no session, no login, nothing to persist
  client-side.
- **No IP retention in Periplo's own code.** The application layer never
  reads, logs, or stores a request's source IP. (The underlying host,
  Fly.io, may keep its own standard infrastructure access logs as part of
  operating the platform; that's Fly's layer, governed by Fly's own
  policies, not something this codebase controls or reads from. Stated
  here so the distinction is explicit, not blurred into "Periplo collects
  nothing at all.")
- **Aggregate operational metrics only, when they exist.** `docs/SPEC.md`
  §8 calls for publishing requests served, error rate, latency, and
  catalog size, aggregate numbers, never per-request detail. **Real
  state: this doesn't exist yet.** There is no telemetry endpoint beyond
  the bare `GET /health` (`{"status":"ok"}`, no counts, no timings).
  Tracked as still-open Phase 10 scope in `docs/DEFERRED.md`, not
  claimed here as built.

## What the Bazaar catalog stores, and why none of it is personal

The catalog (`packages/bazaar/src/db/`, `supabase/migrations/`) stores
resource metadata a seller's own extension declaration provides: a URL, a
route template, a description, a JSON schema, payment terms
(scheme/network/asset/`payTo`). `payTo` is the seller's own Stellar
address, disclosed by the seller as part of listing a paid service, the
same way it would appear on any public payment request. Nothing about the
*buyer* who triggered the catalog write is stored: `packages/bazaar/src/db/catalog.ts`'s
`CatalogResourceInput` has no payer field at all. A resource gets
cataloged because a payment happened, not because of who paid.

## Anchoring, not raw data

Where this project ever needs to prove something happened without storing
the thing itself, the pattern is a hash, not the payload. This is the
same principle Contextio's Legal Context Protocol applies to legal terms
(a SHA-256 anchored on-chain, never the document's contents on-chain);
Periplo's own version of it is smaller in scope today, since Bazaar
listings are already public resource metadata a seller chose to disclose,
not something that needs anchoring to avoid exposing it. If a future
phase adds anything that would otherwise require storing sensitive
request data, anchor a hash of it instead of the data itself, the same
answer, applied when it's actually needed rather than pre-built for a
case that doesn't exist yet.

## Why this is a stronger answer than a privacy policy

Collecting nothing personal reduces GDPR/equivalent exposure to
approximately nothing, not because of a document saying so, but because
there's nothing collected for such a document to govern. This file is a
description of the architecture, kept honest against what the code
actually does (checked directly against `apps/facilitator/src/*.ts` and
`packages/bazaar/src/db/*.ts` while writing it, not assumed from the
spec's own aspirational language), not a policy that could drift from
the code without anyone noticing.
