# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Periplo: the discovery layer for x402-payable services on Stellar, built for a
Stellar Community Fund RFP Track submission responding to "X402 Facilitator
with Bazaar (discovery) support" (SCF #45, Q3 2026). RFP Track is
panel-reviewed, not community-voted: reviewers test the wire protocol
directly rather than read prose claiming conformance.

The full build plan lives at [`docs/SPEC.md`](docs/SPEC.md), read it before
starting any phase. It is phased (0–10); each phase ends in a gate command
that must exit 0 before the next phase starts. **Current status: Phase 6
(`upto` on Stellar) complete, Phase 6b (additional evidence, not a tranche
deliverable) has real contract-level results and a genuinely open blocker,
Phase 7 (MCP discovery server) next. The SCF Build Award was submitted
2026-08-11; prescreen is pending.** See
[`docs/DEFERRED.md`](docs/DEFERRED.md),
[`docs/UPTO-CONVERGENCE.md`](docs/UPTO-CONVERGENCE.md) (the `upto` wire-spec
convergence story: `#3098`/`#3134`/`stellar/x402-stellar#72`, consolidated
out of README.md so it isn't told twice),
[`conformance/RESULTS.md`](conformance/RESULTS.md),
[`conformance/baseline/`](conformance/baseline),
[`docs/conformance/`](docs/conformance) (dated transcripts of the official
`x402-foundation/x402` e2e suite run for real against the live
deployment, not a Periplo-authored equivalent),
[`packages/bazaar`](packages/bazaar), [`packages/search`](packages/search),
[`eval/`](eval), [`supabase/`](supabase),
[`apps/facilitator`](apps/facilitator), and
[`contracts/upto-settlement`](contracts/upto-settlement) for what exists
concretely. Do not start a phase whose predecessor hasn't cleared its gate.

**CI passing locally is not the same claim as CI passing.**
`.github/workflows/ci.yml` silently failed to run at all from Phase 1
through Phase 3 before being fixed (two stacked causes, full evidence in
`docs/DEFERRED.md`), while every phase's local `pnpm ci` was genuinely
green the whole time; don't assume CI mirrors the local gate. See
[`docs/TOOLING.md`](docs/TOOLING.md#checking-ci) for the check command.

**Supabase project and a Stellar testnet fee-sponsor account are both
live** (provisioned mid-build, not self-hosted by this session), and
**`apps/facilitator` is also live on Fly.io** at
`https://periplo-testnet.fly.dev` (`stellar:testnet` only, 1 machine,
scaled down from Fly's default-2; `docs/DEFERRED.md` has the reasoning),
pulled forward from Phase 10 at explicit request, not a sign the rest of
Phase 10 is done. Real Stellar testnet test fixtures exist too, not just
`PTEST` (the self-issued token from Phase 3): a real testnet USDC
trustline for exercising a live payment end to end. See
[`docs/TOOLING.md`](docs/TOOLING.md) for exact commands: local
integration tests, credentials, redeploying, and the Fly account gotcha.

## Non-negotiable constraints (spec §1): check every change against these

- **Apache-2.0 only.** No AGPL, no other copyleft, anywhere in the shipped
  dependency path. `pnpm licence-check` enforces this against `dependencies`
  + `optionalDependencies` (not `devDependencies`, see the comment block in
  `packages/licence-check/src/cli.ts` for why that split exists).
- **Build on `@x402/stellar`. Do not reimplement verify/settle.**
- **Non-custodial by construction.** The facilitator sponsors network fees
  only; it must refuse to boot if configured with a key that can move user
  funds. It must never be the transaction source, operation source, or
  `from` address in a client payment, and must never appear as a signer in
  a client auth entry.
- **Never use "SDK" or "Developer" in the project name, repo title, or
  top-level description** (package directory names may use them).
- **Every rejection carries a non-null `reason`.**
- **README/doc claims need a link, a test, or a hash.** No capability claims
  without evidence, prefer "not implemented" to an optimistic claim.
- Reference repos with no explicit permissive licence (listed in
  `docs/SPEC.md` §1 point 8) are read-only inspiration only, never copy
  code from them or add them as a dependency.

## Commands

Requires Node ≥22, `pnpm@11.22.0` (pinned via `package.json`'s
`packageManager` field). Use `pnpm run ci`, not bare
`pnpm ci` (the bare form is a reserved pnpm CLI alias, not this repo's
gate script). See [`docs/TOOLING.md`](docs/TOOLING.md) for the exact
commands, the nvm switch needed on this machine, and the `pnpm ci`
shadowing gotcha in full.

## Architecture

pnpm workspace: `packages/*` and `apps/*` (`pnpm-workspace.yaml`).
TypeScript project references: root `tsconfig.json` lists `references` to
each package's `tsconfig.json`, which extends `tsconfig.base.json`.
`pnpm typecheck` runs `tsc -b` from the root: **a new package needs a
`{ "path": "packages/<name>" }` entry added to root `tsconfig.json`'s
`references` array, or `tsc -b` silently skips it.**

`packages/licence-check`, `packages/bazaar`, `packages/search`,
`packages/evidence-check`, `apps/facilitator`, and `eval/` exist so far
(Phases 0–5; `packages/evidence-check` is a CI-gate addition outside the
phase numbering, same as `packages/licence-check`, see the Architecture
section below). `contracts/upto-settlement` also exists and is built
(Phase 6, deployed to `stellar:testnet`, see below), but deliberately
outside the pnpm workspace, so it has no `pnpm-workspace.yaml` entry and
isn't part of this list. Everything else
in the target layout (`apps/hub`, `packages/mcp`, `packages/helpers`,
`spec/`, `conformance/` runner, `examples/`) is **planned,
not built**, see `docs/SPEC.md` §3 for what belongs where. Don't create
empty placeholder directories for phases that haven't started (spec §12:
no invented scope).

`packages/licence-check` is the pattern for any future CI-gate package:
pure classification logic in one file (`classify.ts`, fully unit tested),
plus a thin CLI wrapper (`cli.ts`) that shells out to real tooling
(`pnpm licenses list --json`) and is exercised only through the gate itself,
not unit tests. It deliberately checks the **production** dependency graph
(`--prod`: `dependencies` + `optionalDependencies`) as the hard, blocking
gate, and reports devDependency-only copyleft findings as warnings. The
concrete case that motivated the split is `vitest` → `vite` →
`lightningcss` (MPL-2.0), unavoidable while pinning `vitest@4.1.11` but
never bundled into a deployed service.

`packages/bazaar` is the catalog trust boundary (Phase 1):
`checkRouteTemplate` (decode-fully-THEN-validate against traversal/absolute/
protocol-relative attacks, incl. percent-encoding and backslash variants,
see the module doc in `route-template.ts` for the full reasoning) and
`softDropFields` (a generic, schema-agnostic field-level soft-drop
mechanism). In the event, Phase 4's actual discovery-payload schema
validation goes through `@x402/extensions/bazaar`'s own Ajv-based
`validateDiscoveryExtension` instead: atomic, not per-field. An invalid
`info`/`schema` rejects the whole extension rather than softly dropping one
bad field, because that's how the upstream package (and the wire spec it
implements) actually validates it. `softDropFields` itself is still real
and tested, just not wired into Phase 4's own path, see `docs/DEFERRED.md`
for where it would actually apply (`resource.serviceName`/`tags`/`iconUrl`,
which upstream soft-drop-sanitizes but Periplo's current Phase 2 schema has
no columns for yet). `routeTemplate` never goes through soft-drop: it's the
catalog key, so an invalid one hard-rejects the whole listing rather than
being softly dropped. Catalog storage must always key
on the client's **original** (un-decoded) `routeTemplate` string, decoding
is for validation only, never for what gets stored.

`supabase/` (Phase 2) is the Supabase CLI's own project layout:
`config.toml` plus `migrations/*.sql`, applied with `supabase db push
--db-url <pooler-url>` (the direct/session connection is IPv6-only and
unreachable from this build's sandbox; the pooler works fine for plain DDL,
see `docs/DEFERRED.md`). `packages/bazaar/src/db/` is the TypeScript
side: `client.ts` (typed `createAnonClient`/`createServiceRoleClient`
factories, **`Database`/`ResourceRow` must stay declared with `type`, not
`interface`**, or `@supabase/supabase-js`'s query builder silently
resolves every result to `never` instead of erroring; see the comments in
`client.ts` and `docs/DEFERRED.md` before changing this) and
`resources.integration.test.ts` (real RLS tests against the live project,
`describe.skipIf`-gated on `SUPABASE_*` env vars so they degrade to a skip
rather than a failure without credentials). The `resources` table is
public-read (RLS + explicit grants for `anon`/`authenticated`); only the
service-role key can write, and that key must never reach a browser bundle.

`apps/facilitator` (Phase 3) is `verify`/`settle`/`supported` for the
`exact` scheme, built on `@x402/core` + `@x402/stellar` (spec §1: do not
reimplement verify/settle). `src/core.ts` is the importable library core:
`createFacilitatorCore(config)` wraps `@x402/core`'s `x402Facilitator`
dispatching to `@x402/stellar`'s `ExactStellarScheme`, which already
implements the per-payment facilitator-safety checks internally (not
reimplemented here). `src/app.ts` is a thin Hono HTTP layer around that
core, deployment paths 1/2 (hosted/self-hosted); path 3
(self-facilitation inside a resource server) imports `core.ts` directly
and skips HTTP entirely. `src/boot-safety.ts` is this repo's own addition,
not from the libraries: refuses to construct a `FacilitatorCore` if any
configured fee-sponsor account holds a non-native-XLM balance (spec §1
constraint 3, a fee-only account has nothing to move).

**Two import traps specific to `@x402/stellar`, both documented inline
where they'd bite:**
- Import `ExactStellarScheme` for the facilitator from
  `@x402/stellar/exact/facilitator`, **not** the package's main entry.
  The main entry re-exports the *client* variant under the same class
  name. Wrong import type-errors confusingly instead of pointing at the
  real cause.
- Any `paymentRequirements` built for the Stellar `exact` scheme needs
  `extra.areFeesSponsored: true`, or the client throws before it even
  builds the transaction.

`src/serve.ts` binds `@hono/node-server` (MIT, added outside spec §2's
manifest, flagged per working rule 6, not silently added, when the
project owner asked for the Fly deploy directly) to `0.0.0.0:$PORT`,
reading fee-sponsor secrets from `STELLAR_FEE_SPONSOR_SECRET[_TESTNET|_PUBNET]`
and (Phase 4) `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` for the catalog
client, the latter pair is optional; the facilitator boots and serves
fine without them, it just validates bazaar extensions without persisting.
Tests still exercise the app via Hono's in-memory `app.request()`, no
network needed for `pnpm test`. `GET /` returns a small JSON description
of the service (no claims beyond what's real, no frontend exists, see
`apps/hub` below); it existed only as a bare 404 before a live user check
surfaced the gap.

`src/discovery.ts` (Phase 4) is automatic cataloging: `processBazaarExtension`
extracts and validates a payment payload's `extensions.bazaar` using the
official `@x402/extensions/bazaar` package (`extractDiscoveryInfo`,
`validateDiscoveryExtension`, `validateDiscoveryExtensionSpec`, same
"don't reimplement the wire protocol" principle §1 applies to verify/settle,
extended here; flagged as an outside-manifest addition per working rule 6),
except `routeTemplate` itself, which is checked with `packages/bazaar`'s own
`checkRouteTemplate` instead, upstream's equivalent is strictly weaker
(single percent-decode pass vs. Periplo's bounded-repeated decode) and
doesn't satisfy the Phase 4 gate's hard-reject requirement. Full comparison
and a genuine upstream bug found via the live integration test (`mcp://`
URLs resolve to a broken `null/...` catalog URL because `mcp:` isn't a
WHATWG special scheme) are in [`docs/INTEROP.md`](docs/INTEROP.md). `app.ts`
wires this into `/settle` only (originally also wired into `/verify`;
see the settle-only correction below), cataloging runs after the
underlying payment call itself succeeds (the facilitator is a trust
boundary), and the outcome is reported via the `EXTENSION-RESPONSES` header
regardless of whether a catalog client is configured. `packages/bazaar/src/db/catalog.ts`
is the write path: reads the existing row (if any) by the
`(url, route_template, tool_name)` key, merges the new payment option into
`accepts` rather than duplicating rows, and upserts. Its `dedupeKey` folds
in `extra.uptoProfile` unconditionally (not just when `scheme === "upto"`),
closing a real data-loss bug found responding to external review: two
`accepts` entries differing only in `extra.uptoProfile` used to hash to
the same key and silently overwrite each other, see
`docs/UPTO-CONVERGENCE.md`.

**Two real, dead-catalog-entry bugs found by external QA (2026-08-19),
both fixed with a code gate plus a real backfill, not just documentation.**
The live catalog held exactly two rows, both unreachable: `url =
"null/financial_analysis_da8703fa-2ee7-4922-aed5-b8cee63b908c"` (cataloged
2026-08-11, the opaque-origin bug above, predating the reconstruction fix
in this file, which only ever applied to writes made after it landed) and
`url = "http://localhost:4022/exact/stellar"` (cataloged 2026-08-17, a
plain unreachable local host from local dev/conformance testing, not an
opaque-origin problem at all, no code path had ever validated it). The
practical effect, confirmed directly by the tester: every query against
`GET /discovery/search` returned one of these two dead URLs regardless of
relevance, making ranking quality genuinely unjudgeable from outside.
Root-caused and fixed two ways: `packages/bazaar/src/catalog-url.ts`'s
`checkCatalogUrl` is now enforced inside `upsertCatalogResource` itself
(not just at the one call site that produced the opaque-origin bug), so
it catches both bug classes regardless of which code path writes a URL,
rejecting `null/*`, non-http(s)/mcp schemes, and local hosts (`localhost`,
`127.0.0.1`, `*.local`); a rejection throws `InvalidCatalogUrlError`,
which `apps/facilitator/src/discovery.ts` catches and converts into the
same `{ status: "rejected", rejectedReason }` outcome every other
bazaar-extension validation failure already produces, rather than 500ing
an otherwise-successful `/verify` or `/settle` response over a cataloging
concern. `supabase/migrations/20260819120000_backfill_bad_catalog_urls.sql`
is the one-time backfill for what the gate couldn't retroactively touch.
It rewrites a recoverable `null/*` row to its correct
`mcp://tool/{toolName}` form when `tool_name` is present, the exact fix
applied to the real `financial_analysis_da8703fa-...` row (its `id`
unchanged after `supabase db push`, confirming it was rewritten in place
rather than replaced, verified by re-querying the live table). It deletes
anything left that the gate would now reject, including the real
`localhost:4022` row, confirmed deleted the same way. Real evidence, not
asserted: 2 bad rows before the migration, 1 correct row after, both
counts read directly off the live Supabase project via its REST API, not
from the migration's own reported success. Test coverage:
`packages/bazaar/src/catalog-url.test.ts` (pure),
`packages/bazaar/src/db/catalog.test.ts` (proves the gate runs before any
database call, via a client whose `.from()` throws if reached), and a new
case in `apps/facilitator/src/discovery.integration.test.ts` (a real
`localhost` `resource.url` against the live Supabase project produces a
`rejected` result and no row). External QA credited without a name here
deliberately, unlike whawk46 elsewhere in this repo: whawk46's own GitHub
handle already appears publicly on the issues being quoted, this
tester's name reached this session only through a private conversation
with no indication they want it in a public repo, so it stays unnamed
unless they say otherwise.

**2026-08-25: cataloging moved to settle-only**, closing a real
free-mint path the bazaar extension's own spec text leaves open by not
requiring settlement before cataloging. `/verify`'s `isValid: true`
proves a payload could settle, not that it did, so cataloging on that
signal let a catalog row (and each `accepts` entry in it) be produced
for one HTTP request and no balance, exactly the ambiguity
[x402-foundation/x402#3226](https://github.com/x402-foundation/x402/issues/3226)
is auditing in public, and independently confirmed by
[pedro-pelicioni](https://github.com/pedro-pelicioni)'s stellarsight
facilitator, which took the same settle-only reading, code checked
directly rather than taken on the comment alone. Periplo's own ranking
has no popularity/count column to inflate (checked directly against the
SQL), but the catalog's mere contents, resources and accepted payment
options that were never actually paid for, could previously be minted
the same way. `/verify` no longer calls `processBazaarExtension` under
any condition; `/settle` is now the only trigger. Full writeup,
including the two other implementers who reached the same conclusion
independently, in `docs/DEFERRED.md`. `pnpm run ci` green throughout,
255 tests.

**2026-08-26: two more real catalog bugs, found reconciling a third
party's conformance report against the live deployment rather than
assuming either side was right.** `GET /discovery/resources` and
`GET /discovery/search` echoed `extensions.bazaar: {}` for every
resource, `temperature-convert` included, despite its own live 402
challenge carrying the full declared extension. Root cause was in the
read path (`discovery-routes.ts`'s `toDiscoveryResource`), not the
write path: `resources.extensions: text[]` only ever tracked which
extension keys a resource declared, never their payloads, contradicting
`@x402/extensions/bazaar`'s own installed `DiscoveryResource` type,
which documents that field as "Extension payloads echoed from
discovery." Fixed by adding `extension_payloads jsonb` (migration
`20260826010000`, `periplo_hybrid_search`'s `RETURNS TABLE` shape
updated too, requiring an explicit `DROP FUNCTION` first since
`CREATE OR REPLACE` cannot change a return type, same lesson
`20260820103000` already learned for an argument-list change), written
from `discovery.ts`'s already-validated `rawExtRecord`. Deployed and
verified against the live catalog, not just locally: a real settled
payment against `/demo/temperature-convert`
([`12470945ac72...`](https://stellar.expert/explorer/testnet/tx/12470945ac72aed3b781f102848f2346c85e3c85d874fb2a3ff6cf17df6cd375),
Horizon-verified) re-cataloged it with the fix live, confirmed via
`GET /discovery/search` actually returning the full `info`/`schema`
object afterward. Separately, the `financial_analysis_da8703fa-...`
Phase 4 test fixture (still live since 2026-08-11, its URL fixed by the
2026-08-19 backfill but never its content: `asset: "CTESTASSET"`,
`pay_to: "GPHASE4TEST"`, both literal placeholders, no real MCP tool
behind the URI) was deleted (migration `20260826020000`), confirmed
gone via the live REST API and both discovery endpoints. Both bugs
found by independently reconciling a conformance report against this
project's own live deployment: two of the report's three claimed gaps
didn't match the raw 402 challenge, but did match what
`/discovery/search` actually returned, reframing which endpoint the
report's own tooling most likely measures. The report's separate
CORS-header claim, initially left open, was resolved the same round: it
measures `nirium-agent-mainnet.fly.dev` (an unrelated deployment, real
CORS present there), never Periplo, confirmed by the report's own
author and independently corroborated against both endpoints directly.

**Same round, the first real external seller (Fer, `agentpayments.fi`)
published and settled for real**, closing the loop this whole round
exists for, and found a new, real, money-relevant bug in the process:
`EXTENSION-RESPONSES` never reached their code from `/settle`, even
though cataloging genuinely happened. Root-caused before proposing a
fix: the header is genuinely sent correctly on the wire (confirmed via
a direct, non-browser `fetch`, so no CORS visibility restriction
applies), but the installed `@x402/core@2.22.0`'s own
`HTTPFacilitatorClient.settle()`/`.verify()` only `console.log` the
header internally, then discard it, never attaching it to what those
methods return to the caller, confirmed reading the real compiled
source. Fixed without an upstream change: `SettleResponse` already
declares an unused `extensions` field the same client already parses,
so `/settle` now sends the outcome in the body too, verified through
the real official client (not just a raw fetch): a settled payment via
`HTTPFacilitatorClient.settle()` now returns `settleResult.extensions`
populated, transaction
[`10919a59342fc0cc...`](https://stellar.expert/explorer/testnet/tx/10919a59342fc0cc69d3698a58cf7fb76f3e997914e16562ffa39bbf7f70af28),
Horizon-verified. `docs/SELLERS.md` corrected to match (stale
"/verify and /settle" wording, plus the `HTTPFacilitatorClient`
limitation the old "decode it yourself" advice didn't mention). Full
writeup, including whether this is worth filing upstream against
`@x402/core` (a filing decision, not made unilaterally) and a metric
correction adopted from the same seller (parameter counts, not raw JSON
character counts, to compare discovery-payload completeness), in
`docs/DEFERRED.md`. `pnpm run ci` green, 257 tests.

The same tester's report also named the actual practical effect: an empty
or dead-URL-only catalog means Bazaar's ranking quality can't be evaluated
by anyone outside the build. `apps/facilitator/src/demo-resource.ts` is
the fix, one real, payment-gated resource (temperature-unit conversion,
real arithmetic, not a canned response) built on `@x402/hono`'s
`paymentMiddleware` + `@x402/core/server`'s `x402ResourceServer` +
`@x402/stellar/exact/server`'s `ExactStellarScheme` (self-facilitation,
spec §5 Phase 3's deployment path 3, sharing this same process's
`FacilitatorCore`, so `apps/facilitator` never reimplements the 402/
settlement wire protocol just because this route isn't the hosted
verify/settle path). `@x402/hono` is a new outside-manifest addition
(Apache-2.0, flagged per working rule 6, same treatment as
`@hono/node-server`). Cataloging is not automatic just because the bazaar
extension is registered on the resource server: it's wired explicitly via
an `onAfterSettle` hook calling the same `processBazaarExtension` the
hosted `/settle` route already calls. Tested in-process
(`demo-resource.test.ts`, a fake `FacilitatorCore`, seven cases including
the x402 v2 wire detail that the `PaymentRequired` payload travels in the
`payment-required` response header, not the body, and that a verified
payment's own `PAYMENT-SIGNATURE` header, not `X-PAYMENT`, is what v2
actually uses, confirmed against the real upstream client rather than
assumed) and `pnpm run ci` green throughout (218 tests).

**Deployed and exercised for real, 2026-08-19, two more real bugs found
along the way, both fixed before the settlement that finally worked.**
First, the same Fly.io account gap `docs/DEFERRED.md` already documents
once recurred (`periplo-testnet` lives under `ticketsafes@gmail.com`,
this session's `fly` CLI needed re-authenticating), resolved the same way
as before. Second, once deployed, `GET /demo/temperature-convert`'s own
402 challenge reported `resource.url` as `http://periplo-testnet.fly.dev/...`,
wrong scheme: `@hono/node-server` derives a request's scheme purely from
`request.socket.encrypted` (read directly from its own source, no
`X-Forwarded-Proto` awareness at all), which is always false behind
Fly's TLS-terminating proxy. Reachable in practice (Fly 301-redirects
`http://` to `https://`, confirmed live) but not the canonical URL, the
same class of "resolves but isn't the real address" problem this whole
round exists to fix, just one layer further down the stack than the
opaque-origin bug above. Fixed with `DemoResourceConfig.baseUrl`, an
explicit, deployment-known base URL passed as `RouteConfig.resource`
(`x402HTTPResourceServer.ts`'s own `routeConfig.resource ||
adapter.getUrl()`, checked directly in the SDK's source), which takes
precedence over the SDK's own request-derived URL, sidestepping the
proxy-detection problem entirely rather than patching Node server
internals. Regression-covered in `demo-resource.test.ts`.

Third, the first two real settlement attempts against the live deployment
both failed with `invalid_exact_stellar_payload_fee_exceeds_maximum`,
not a bug in this round's own code: real testnet Soroban resource fees
for a plain SAC transfer were running about 72,000 stroops that day
(`fee_stats.fee_charged.p95` on Horizon: `75,739`), above
`@x402/stellar`'s own inherited default ceiling of 50,000 stroops, a
value this project had never consciously chosen for current network
conditions. Not specific to the demo route either: `/verify`/`/settle`
share the exact same `ExactStellarScheme` config and would hit the same
ceiling under the same conditions. Fixed by adding
`MAX_TRANSACTION_FEE_STROOPS` (`serve.ts`), set to 200,000 stroops
(0.02 XLM, trivial against the fee-sponsor's ~10,000 XLM testnet
balance) on the deployed facilitator. `apps/facilitator/scripts/demo-resource-settle.ts`
then settled for real: transaction
[`dde62ac5e6...`](https://stellar.expert/explorer/testnet/tx/dde62ac5e67730a0751052a2dafc67dffc595df20bacbae9aaa1c758081deaea),
Horizon-verified (`fee_charged: 56757`, source account the fee-sponsor,
matching `STELLAR_FEE_SPONSOR_PUBLIC` exactly), recorded in
`conformance/RESULTS.md`. The catalog now holds the resource at
`https://periplo-testnet.fly.dev/demo/temperature-convert`, confirmed via
`GET /discovery/resources`, the first genuinely externally-reachable
entry the catalog has ever had.

Seller-facing docs (including per-parameter
descriptions, the primary input to Phase 5's search ranking) are in
[`docs/SELLERS.md`](docs/SELLERS.md). The `mcp://` canonical-URL bug
documented in `docs/INTEROP.md` §2 is filed upstream as
[x402-foundation/x402#3121](https://github.com/x402-foundation/x402/issues/3121)
(bug report, not a spec PR, see `CONTRIBUTING.md`'s scope for issues).
`apps/facilitator/src/discovery-routes.ts` (added 2026-08-17) is
`GET /discovery/resources`/`GET /discovery/search`, the two spec §4 routes
that didn't exist at all before then: reuses `@x402/extensions/bazaar`'s
own `DiscoveryResource`/`DiscoveryResourcesResponse`/
`SearchDiscoveryResourcesResponse` types rather than redefining the wire
shape, same principle as the write path above. Search filters
(`type`/`payTo`/`network`/`extensions`) apply as an in-process post-filter
over `hybridSearch`'s ranked rows, since `periplo_hybrid_search` doesn't
take them as SQL parameters, documented as a real, honest limitation in
the module's own doc comment. (`/supported`'s own `upto` support is
covered later in this file, under `upto-stellar-scheme.ts`.)

`packages/search` (Phase 5) is hybrid retrieval: lexical (`fts`/GIN, from
Phase 2) fused with semantic (`embedding`/HNSW) via Reciprocal Rank Fusion.
`src/embed.ts` wraps `fastembed`'s `BGESmallENV15` (384-dim, local, no API
key, chosen over `@huggingface/transformers` because that package's
`sharp` dependency pulls in an LGPL-3.0 binary that
`packages/licence-check` hard-denies; full reasoning, including why
hand-rolling ONNX inference directly was tried and abandoned, in
`docs/DEFERRED.md`). **`Array.from(...)` on fastembed's output is
load-bearing, not styling**: the package's own `.d.ts` says `number[]`,
but it returns `Float32Array` at runtime, and `JSON.stringify` on a
`Float32Array` serializes as `{"0":v,...}` instead of `[v,...]`, Postgres
rejects that for a `vector` column outright. Found against the real
Supabase integration test, not from the types. `src/discovery-text.ts`
builds the embeddable string from a resource's description and parameter
schema (recursing for `description` keys and property names, so it
doesn't need to special-case HTTP vs. MCP shapes). `src/hybrid-search.ts`
calls `periplo_hybrid_search`, the RRF SQL function in
`supabase/migrations/20260812080000_search.sql`, that migration also
corrects `resources.embedding` from Phase 2's placeholder `vector(512)`
to `vector(384)` (matching the chosen model; safe in place, the column
was all-NULL). `apps/facilitator/src/discovery.ts` calls
`buildDiscoveryText` + `embedDocument` right before
`upsertCatalogResource`, so every payment that catalogs a resource embeds
it automatically, failures there never block cataloging itself
(`embedding` stays `undefined`, not `null`, on failure, so a transient
error on a *repeat* payment can't clobber an embedding a prior write
already stored; see `packages/bazaar/src/db/catalog.ts`'s
`CatalogResourceInput.embedding` doc comment). `src/serve.ts` fires an
unawaited warm-up call at boot so the first real payment isn't the request
that pays for downloading the model.

A real search relevance-floor bug, found live by a user re-testing
`/discovery/search` against a near-empty production catalog, is fixed in
two parts: `fts` (`supabase/migrations/20260807202307_resources.sql`) now
folds in `tool_name`/`route_template`, not just `description`/
`parameters`, and `periplo_hybrid_search`'s semantic leg
(`supabase/migrations/20260812080000_search.sql`) now enforces a minimum
cosine similarity, previously absent, which let the single nearest
embedded row win for any query regardless of true relevance. The first
calibration attempt (0.8, from the one demo resource's own real
similarities) regressed nDCG@10 50% against the real
`eval/golden.jsonl` gate and was corrected to 0.6; even that doesn't
fully close the bug, since real true positives and the reported false
positives overlap in the same similarity band for this model. Full
root-cause writeup, both migrations, and the honest remaining gap are in
`docs/DEFERRED.md`.

`eval/` is the Phase 5 gate: `pnpm eval` seeds `fixtures.ts` through the
*real* `upsertCatalogResource` path, runs every query in `golden.jsonl`
through the real `hybridSearch`, computes nDCG@10/MRR (`metrics.ts`, pure
and unit-tested), and fails if nDCG@10 regresses more than 5% against the
committed `baseline.json`. **The fixture/query set is deliberately two-tier,
not just "diverse":** 20 resources in unrelated domains (weather vs.
translate vs. currency, one plausible answer per query) plus ~15 clusters
of 2-5 near-duplicate resources each (`geocode` vs. `reverse-geocode`;
`weather` vs. `weather-forecast` vs. `air-quality` vs. `uv-index` vs.
`weather-alerts`; and more). The first, easier tier alone scored nDCG@10
0.99, which a review correctly flagged as an overfitting signal rather
than evidence of good ranking, since every query only ever had one
plausible candidate. Expanding to the harder tier (55 resources, 300
graded queries total) dropped the real score to nDCG@10 0.9346, MRR
0.9226, reported as-is, not tuned back toward the old number. Full
reasoning in `docs/DEFERRED.md`. Not an `apps/*` or `packages/*` glob
match, so it needs its own explicit `pnpm-workspace.yaml` entry to resolve
`@periplo/bazaar`/`@periplo/search` as real workspace dependencies.
`.github/workflows/ci.yml` runs it as its own step (secrets-gated via a
job-level `env:` + `if: env.SUPABASE_URL != ''`, not `if: secrets.X`,
GitHub Actions' schema doesn't allow `secrets` directly inside `if:`,
caught by the editor's validator before it shipped, not assumed).

`contracts/upto-settlement` (Phase 6) is a standalone Cargo/Rust project
(`soroban-sdk 27.0.5`), not a pnpm workspace member: no `tsconfig.json`,
no `pnpm-workspace.yaml` entry, its own `Cargo.toml`/`Cargo.lock`. The
`UptoSettlement` contract's `settle(authorization, actual_amount)` is the
whole public surface (one exported function, checked in the build
summary): `authorization.from.require_auth_for_args((authorization,))`
is the actual mechanism that makes `upto` expressible on Soroban. It
keeps `actual_amount` outside what the buyer signs, so a plain
`require_auth()` (which would authorize the full arg list including the
charge) would collapse `upto` into `exact`. `authorization.facilitator`
gets its own separate `require_auth()`, satisfied in the deployed flow by
the facilitator being the submitting transaction's source account (no
separate signed entry needed, confirmed live, not assumed, via
`inspectAuthEntry` on a real testnet simulation). Time bounds are ledger
sequences, never timestamps; `MAX_WINDOW_LEDGERS` (17,280, ~1 day at
5s/ledger) is a contract-level ceiling independent of and tighter than
the network's own storage-TTL ceiling (`state_archival.max_entry_ttl`,
checked live via `stellar network settings --network testnet`, not
assumed, see `docs/DEFERRED.md`). The nonce lives in `temporary()`
storage because the deadline dominates it: an entry only needs to survive
until `deadline_ledger`, checked unconditionally before the nonce check
ever runs. Pull-and-refund is atomic, up to three token transfers in one
invocation, no custody window, and `settle` asserts a zero contract
balance at the end as a genuine runtime check (`Error::
BalanceInvariantViolated`), not just a test assertion, since Soroban's
"transaction is the atomicity boundary" guarantee means a non-standard
(e.g. fee-on-transfer) token would otherwise be able to leave value stuck
silently. `src/test.rs` (29 unit tests) and `src/property_test.rs` (6
proptest properties, ~1,500 randomized cases per run) share one fixture
path via `test::setup_with_env`, which is also why property tests build
their own `Env` with `EnvTestConfig { capture_snapshot_at_drop: false }`
instead of reusing `test::setup` directly. An earlier version left
`test_snapshots/` at 1,557 files / 24MB (one snapshot per randomized
case), never committed, fixed before it became a problem. `fuzz/` is a
real `cargo-fuzz` target (`fuzz_settle_arithmetic`, nightly toolchain,
`gcc` sufficed for the bundled libFuzzer runtime, no `clang` needed
despite the smart-contracts skill assuming it) exercising the
ceiling/time-bound arithmetic across the full `i128`/`u32` input space
with auth always granted (`mock_all_auths`); auth-approval/rejection
itself is a small enumerable state space the unit and property tests
already cover exhaustively by name, so the fuzz target spends its budget
on the arithmetic instead. It found two real harness bugs before settling
at 47,630 clean executions: a fixed buyer-supply constant smaller than a
fuzzed `max_amount` (surfaced the token's own insufficient-balance error,
not a contract bug), and an unclamped ledger-sequence fuzz input that hit
a `soroban-sdk` testutils limitation at ledger ~4.29 billion (reproducible
with zero `UptoSettlement` code involved, isolated to `env.register()`
itself; real Stellar is nowhere near that height and won't be for
centuries, so `fuzz_settle_arithmetic` clamps ledger inputs to a
generous-but-realistic `0..100_000_000` range instead). Deployed to
`stellar:testnet` at `CAK3R734WLT4JU2XMQOJ6NIB3BWGPI442CH44EFJG5AORMXFE7G4MQFW`
via a dedicated `periplo-upto-deployer` identity (separate from the
fee-sponsor, which never deploys code, spec §1 constraint 3).
`apps/facilitator/scripts/upto-settle-demo.ts` is the verification
script: real partial settlement (buyer signs a ceiling, facilitator
settles less), auth-entry structure and resource usage read directly
from a real simulation (not asserted), nonce TTL read back from RPC after
settlement, recorded in `conformance/RESULTS.md`, cross-checked against
Horizon. It builds against the contract's on-chain spec via
`contract.Client.from(...)` rather than committed generated bindings, so
it stays reproducible from a clean checkout. Wiring `upto` into
`apps/facilitator`'s own `/verify`/`/settle` HTTP routes was originally
separate, not-yet-started work at Phase 6 gate time (that gate is the
contract itself, not this integration); **done as of 2026-08-21**, see
`upto-stellar-scheme.ts` below.

**Phase 6b** (`contracts/agent-verifier`, `contracts/agent-smart-account`,
`contracts/upto-settlement/src/budget.rs`) is additional evidence beyond
Phase 6's own gate, not an SCF tranche deliverable, same treatment as
Phase 4/5/6: zero-settlement is done and evidenced (a real
`actual_amount = 0` transaction, full refund, nonce still consumed,
recorded in `conformance/RESULTS.md`); the OpenZeppelin `stellar-accounts`
smart-account integration (an agent key that can only spend through
`UptoSettlement`, within a reserved budget reconciled against the actual
charge) is built and unit-tested at the contract level but **Periplo's
own `agent-smart-account` still has no real, signed testnet transaction
of its own** — the blocker below is now understood and has a known
workaround, not an open mystery, but that workaround has not yet been
applied to this contract's own `settle()` call. `__check_auth` traps
(`UnreachableCodeReached`) on every construction tried at the time:
`Signer::Delegated` (the original attempt) and `Signer::External` (the
retry, informed by reviewing `authenticate`'s two arms in
`stellar_accounts::smart_account::storage`, not by reading any
competitor's code), both against the real target contract and against a
trivial single-line `probe` contract used to isolate the trap from
`UptoSettlement`'s own complexity. Seven specific hypotheses ruled out
with real evidence (see `docs/DEFERRED.md`'s Phase 6b section for all of
them: encoding method, nonce reuse, nested-entry presence, `AuthPayload`
content, `soroban-sdk` version alignment, target-contract complexity,
signer type, and `Client.from` vs. `AssembledTransaction.build`
directly), plus independent confirmation that `stellar-accounts` itself
has no test coverage of this real, host-driven auth path in either the
crate or its own official example. Filed as
[OpenZeppelin/stellar-contracts#839](https://github.com/OpenZeppelin/stellar-contracts/issues/839).
This diagnostic round was closed on purpose (the user's own instruction:
don't reopen #839 with another angle without a new concrete trigger);
further attempts got their own separately-scoped investigation.
**2026-09-01: cited, not reopened.** `#839`'s existing findings turned
out to be directly load-bearing for the `upto`-on-Stellar spec
consolidation (`#3098`/`#3134` both claim "C-accounts work
transparently," a claim `#839` already shows doesn't hold for a
delegated smart-account signer); see `docs/UPTO-CONVERGENCE.md`.

**2026-09-02: `#839` closed as COMPLETED, root cause found — attribution
matters here, get it right.** Nirium (same GitHub identity, a separate
project, its own real Stellar/x402 agent-key work) independently
investigated the identical underlying question on 2026-09-01 — "from
the Nirium side of this account rather than Periplo," stated explicitly
in the thread, not inferred. **Nirium's own repro, not Periplo's**: a
`Signer::Delegated` on a `ContextRule::CallContract`, hand-constructing
both required `SorobanAuthorizationEntry` objects (the smart account's
own entry and the delegate's) via
[`smart-account-kit`](https://github.com/stellar/smart-account-kit)
rather than trusting standard SDK discovery, submitted for real and
**confirmed on-chain**:
[`f5835897d8...`](https://stellar.expert/explorer/testnet/tx/f5835897d8b42544f2c98efbef7110be9d50308717885012b5a6bc9c20644d9f).
The real root cause, found the same round: `__check_auth` was never the
problem. `AssembledTransaction.needsNonInvokerSigningBy()`/
`signAuthEntries()` never surface a `Signer::Delegated`'s signing
requirement at all for a plain `SOROBAN_CREDENTIALS_ADDRESS` entry,
because Soroban's own recording-mode simulation never actually invokes
`__check_auth`'s body, so a `require_auth_for_args()` call that only
happens inside it can't be discovered ahead of time. A caller trusting
the standard discovery flow builds a transaction that looks complete,
submits it missing the delegate's signature entirely, and
`authenticate()`'s `require_auth_for_args()` then traps on the missing
authorization — the exact `UnreachableCodeReached` symptom `#839`
documented, now explained. Filed by Nirium as
[OpenZeppelin/stellar-contracts#863](https://github.com/OpenZeppelin/stellar-contracts/issues/863)
(closed, `stateReason: COMPLETED`) and
[stellar/js-stellar-sdk#1700](https://github.com/stellar/js-stellar-sdk/issues/1700)
(open, generalized beyond `Signer::Delegated` to any custom account
whose `__check_auth` calls `require_auth_for_args()` on a second
address). An OZ maintainer (brozorec) confirmed the same root cause via
`stellar-accounts`' own docs (its "Transaction Simulation Behavior"
section already states plainly that `require_auth_for_args` calls
inside `__check_auth` aren't included in simulation output) and closed
`#839` itself on that basis.

**2026-09-02, same day: Periplo's own attempt, real partial success, not
overclaimed.** The mechanism that unblocked Nirium is generic, so it was
tried directly against this project's own contracts, at the user's
explicit direction. Deployed a fresh `agent-smart-account` instance
(`CDGCOHRV6XIFGQ2ZYCIOCJ3GDLOEYFWUP3UICE6DD5HQQTEO3OWRK243`, a local,
uncommitted `Signer::Delegated` build, not the `Signer::External` source
on `main`) with both `ContextRule`s the real `settle()` flow needs (id 0
for `UptoSettlement`, id 1 for the asset's nested `transfer`), and
hand-constructed both required auth entries exactly as
`smart-account-kit`'s real source does (transcribed, not re-derived): the
smart account's own entry with an `AuthPayload` signature (`context_rule
_ids` + an empty-bytes `signers` entry for the delegate), and a second,
separate entry for the agent key targeting `__check_auth(auth_digest)`
directly, signed with a plain Ed25519 signature. The full two-context
`settle()` call still failed, but with a clean, typed
`Error(Contract, #3002)` (`SmartAccountError::UnvalidatedContext`), not
the opaque `UnreachableCodeReached` trap #839 documented — real progress
either way. To isolate the cause, built a single-context probe scenario
with the identical construction code (a trivial `probe` contract,
`fn ping(caller: Address) { caller.require_auth(); }`, one `ContextRule`
instead of two): **this settled for real and confirmed on-chain**,
[`428021a6ef648937bf0edeec96d42f13e44447eac9b036c127c90cf4bebdd71b`](https://stellar.expert/explorer/testnet/tx/428021a6ef648937bf0edeec96d42f13e44447eac9b036c127c90cf4bebdd71b),
Horizon-verified (`successful: true`, source account the fee-sponsor).
**This is Periplo's own first real signed testnet transaction where a
`Signer::Delegated` smart account authorized a call** — the discovery-gap
fix genuinely transfers to this project's own environment, confirmed
empirically, not assumed from Nirium's result alone. Reversing
`context_rule_ids` order (`[1, 0]` instead of `[0, 1]`) as a quick
diagnostic on the two-context case changed nothing, inconclusive about
which of the two contexts actually fails
`get_validated_context_by_id`'s checks (`storage.rs`'s own
`Vec::from_iter` panics on the first failing iteration, so which index
caused it isn't visible from the error alone). **Genuinely open, not
resolved this round:** why the two-context `settle()`+`transfer` case
still fails `UnvalidatedContext` when the identical single-context
construction succeeds. `contracts/agent-smart-account/src/lib.rs` was
reverted to its committed `Signer::External` state afterward, no
permanent contract change made; the test instance, the isolation `probe`
contract, and the verification script
(`apps/facilitator/scripts/agent-smart-account-settle-demo.ts`,
`contracts/probe-contract/`) are local and uncommitted as of this entry.

Reviewing the dependencies this project actually builds on, both directly
from the #839 investigation and in separately-scoped bug-hunting rounds
afterward, turned up nine more real, independently verified upstream
bugs, all filed, six still open as of this writing (`#103` merged
2026-08-28 by @kaankacar; `#3187` closed 2026-08-31 when its fix,
`#3228`, merged; `#3270` closed 2026-08-31, resolved upstream, see
below):
[x402-foundation/x402#3169](https://github.com/x402-foundation/x402/issues/3169)
(`isValidRouteTemplate`'s traversal/scheme-injection checks decode once,
so double percent-encoding bypasses both; fix open as
[#3213](https://github.com/x402-foundation/x402/pull/3213), ygd58),
[stellar/js-stellar-sdk#1655](https://github.com/stellar/js-stellar-sdk/issues/1655)
(`needsNonInvokerSigningBy`/`signAuthEntries` only see the top-level node
of a CAP-71 `SOROBAN_CREDENTIALS_ADDRESS_WITH_DELEGATES` entry, missing
an outstanding delegate signature),
[x402-foundation/x402#3172](https://github.com/x402-foundation/x402/issues/3172)
(`x402Facilitator.derivePattern()` silently drops wildcard coverage when
one facilitator registers networks from more than one CAIP-2 namespace),
[stellar/stellar-dev-skill#103](https://github.com/stellar/stellar-dev-skill/pull/103)
(27 of 28 `ECOSYSTEM_CARDS` entries in the `stellar-build` skill pack's own
site linked to GitHub's HTML blob page instead of raw markdown in the
agent-facing `llms.txt`, root-caused to the site's own contribution guide
using the wrong URL shape in its own example; fixed with a PR, not just an
issue, filed against `docs/SKILLS.md`'s own skill-pack repo rather than a
dependency Periplo ships), and
[x402-foundation/x402#3187](https://github.com/x402-foundation/x402/issues/3187)
(the e2e conformance suite's own TypeScript client eagerly derives EVM and
SVM signers regardless of the `--families` scoping the CLI documents as
supported, so a single-family run against a non-EVM/SVM network crashes
unless unrelated-network credentials are set anyway; found running the
real conformance pass in `docs/conformance/`, not from reading the harness
cold; own PR merged 2026-08-31 by @phdargen:
[#3228](https://github.com/x402-foundation/x402/pull/3228), rebuilt and
re-verified against current upstream `main` before opening it, fixing
the exact suite this project's own conformance evidence runs through,
closing `#3187` itself as a result),
and
[stellar/js-stellar-sdk#1681](https://github.com/stellar/js-stellar-sdk/issues/1681)
(`AssembledTransaction.signAuthEntries` can't represent a non-master-key
signer for a plain `Address` credential, in two separate ways: its own
`address` default can never resolve for a bare `SignAuthEntry` function,
the documented common case, and its per-entry signing closure discards
any `signerAddress` a custom signer returns before handing a bare
signature to `authorizeEntry`, which then verifies against the wrong
public key; found attempting a real classic-multisig signer mode for
`exact`, full writeup and the real reproduction in `docs/DEFERRED.md`,
checked against #1610 first to confirm it isn't a duplicate, a fix
proposed in the issue itself, not just the finding), and
[stellar/js-stellar-sdk#1683](https://github.com/stellar/js-stellar-sdk/issues/1683)
(`authorizeEntry`'s own bare-signature fallback path ignores the
`forAddress` parameter entirely when deriving the public key to verify
against, ignoring `forAddress` unconditionally, the exact mechanism
`#1672`'s own PR description had already named as "a second, genuinely
separate bug" found while fixing `#1655`, worked around narrowly inside
`signAuthEntries()`'s own callback at the time rather than fixed, and
never given its own issue until now; a fix proposed in the issue
itself, checked against the CAP-71-delegate case #1655 already covers
to confirm this is the distinct, un-filed half of that same finding),
alongside the earlier `mcp://` canonical-URL bug (#3121, fix at #3138,
open, LGTM'd twice, blocked only on maintainer merge), and
[x402-foundation/x402#3270](https://github.com/x402-foundation/x402/issues/3270)
(`HTTPFacilitatorClient.settle()`/`.verify()` read the
`EXTENSION-RESPONSES` header only to `console.log` it, then discard it,
never attaching it to the object those methods return, even though
`SettleResponse`/`VerifyResponse` already declare an unused `extensions`
field for exactly this; found live by the first real external seller
against this facilitator, root-caused by reading the actual compiled
`@x402/core@2.22.0` source rather than assumed from behavior, a proposed
fix included. **Closed upstream 2026-08-31**, not by the community PRs
this file already tracked: the actual fix was a maintainer's own
separate PR, `#3306` (Python, phdargen), which rejected the community
PRs' shape (merging into the existing `extensions` field) as wrong,
introducing a distinct `extension_responses`/`extensionResponses` field
instead. `#3278` (TypeScript) was revised to match before it merged
separately, afterward; `#3301` (Go) and the Python draft remain open,
unmerged. No `@x402/core` release ships this yet. See `README.md` and
`docs/DEFERRED.md` for the full mechanism). Each was
verified directly against the real published package before filing,
not asserted from reading the source alone; severity was calibrated
honestly in every case (none of the nine is a security vulnerability,
all fail closed or degrade functionally, stated as such in the issue
itself). Two
adjacent projects' repos
(`Vellar-Wallet/vellar-facilitator`, `Ithaca-Labs/openx402`) were read for
architectural understanding only, during the #839 investigation, and
explicitly excluded from every later bug-hunting round; both are direct
competitors for the same SCF RFP, so their code was never copied and
neither repo was ever commented on or interacted with publicly, per
explicit standing instruction.

`packages/evidence-check` (added 2026-08-21) is a CI-only gate, same
pattern as `packages/licence-check`: pure extraction logic in
`extract.ts` (regex-based, fully unit tested, 17 tests) plus a thin
`cli.ts` that does real network/filesystem I/O, exercised only through
the gate itself. It turns the evidence table from a snapshot into
something self-auditing, per explicit user feedback that every other
submission in this SCF round already has a "real tx per row" table and
that alone is no longer a differentiator: on every push, it re-fetches
every Stellar transaction hash cited in `README.md`/
`conformance/RESULTS.md` from Horizon (`successful: true` required),
re-checks every cited GitHub issue/PR against the GitHub API (using the
default `GITHUB_TOKEN`, no extra secret, read-only), re-confirms every
internal doc link still resolves on disk, and pings the live facilitator
(`GET /supported`) to confirm the "Live now" README claim stays true.
Wired into `.github/workflows/ci.yml` as its own step, not folded into
`pnpm run ci`, matching how `pnpm eval` is already kept separate: it
depends on outbound network access to three external services, not just
this repo's own code. Run for real against the live repo before being
declared done, not just reasoned about: 6 transaction hashes and 14
GitHub links, all passed. `docs/THREAT-MODEL.md` (spec §6's threat/
control/test table, formalized into its own citable file, each row
pointing at the real code and test that backs it, including one honest
gap stated rather than hidden: no CI-enforced secret-leakage check
exists yet) and `docs/FOR-REVIEWERS.md` (a short, human-written index
for a panel reviewer, distinct from `CLAUDE.md`'s session-resumption
purpose) were added the same round. `README.md`'s upstream-convergence
story (two direct SCF #45 competitors, Rialto and AutoLayer, building on
the `upto` spec this project opened rather than forking their own) was
pulled out of a buried paragraph into its own top-of-file section,
visible on first scroll, per the same feedback; `docs/UPTO-CONVERGENCE.md`
gained AutoLayer's exact quoted commitment ("will not open a third
competing spec PR"), verified against the real PR comment before being
cited, not paraphrased from memory.

**`upto` is now wired into `apps/facilitator`'s own `/verify`/`/settle`
HTTP routes, closing the gap this file tracked open since Phase 6,
raised to priority per direct request the same round as the items
above.** `apps/facilitator/src/upto-stellar-scheme.ts`'s `UptoStellarScheme`
implements `@x402/core`'s `SchemeNetworkFacilitator` interface for the
`contract` profile; `core.ts` registers it alongside `ExactStellarScheme`
for any network with a configured `UPTO_SETTLEMENT_CONTRACT_TESTNET`/
`_PUBNET` (`serve.ts`), so `/supported` only advertises `upto` where it's
actually reachable, same "advertised support and reachable support must
match" principle as `signers`. No published `@x402/stellar` class exists
for `upto` (spec §1's "don't reimplement verify/settle" only binds
schemes that package ships), so this module instead follows the real,
installed `ExactStellarScheme` facilitator's actual mechanics as closely
as the schemes' real differences allow, read directly from
`@x402/stellar@2.22.0`'s own compiled source (Apache-2.0, already a
direct dependency), not guessed, per the upstream `upto` spec's own
Appendix: "Implementations SHOULD share verification code between the
two schemes where these do not diverge."

Three real, non-obvious mechanics this module gets right, each found by
actually running it against a real testnet simulation and hitting a real
failure first, not reasoned out in advance:
1. **`settle()` reuses the client's already-signed
   `SorobanAuthorizationEntry` verbatim.** `require_auth_for_args`
   commits the buyer's signature to `(authorization,)` only, independent
   of the transaction envelope or `actual_amount`, so a rebuild that
   changes both stays valid, but only if the entry itself is carried
   over unmodified. A tempting shortcut, tried first, of only "porting"
   the raw signature bytes onto a freshly re-simulated entry fails for
   real: Soroban's own protocol-level nonce and `signatureExpirationLedger`
   are chosen fresh by each new simulation, so the preimage a
   re-simulated entry actually needs signed is never the one the buyer
   signed, even for the identical `Authorization` struct.
2. **The facilitator's own `authorization.facilitator.require_auth()`
   needs a structurally-present but unsigned `sourceAccount`-type auth
   entry, auto-generated by simulating with the facilitator as
   transaction source, not something the client provides or something
   satisfiable by omission.** `@stellar/stellar-sdk`'s `assembleTransaction`
   documents, in its own source comment, that a non-empty `auth` array
   on the operation being simulated is treated as "already complete" and
   evaluated as-is, never merged with what the simulator would otherwise
   discover. `simulateFacilitatorRebuild` (a shared private method,
   used by both `_verify`'s validation-only trial and `settle()`'s real
   build) simulates twice for exactly this reason: once with an empty
   `auth` array purely to discover the complete requirement set
   (buyer's entry, freshly generated and unsigned, plus the
   facilitator's `sourceAccount` entry), then again with the buyer's
   *real* signed entry substituted in, to get an accurate resource
   footprint and fee for what actually gets submitted.
3. **`_verify` itself must simulate a facilitator-sourced rebuild, not
   the client's raw payload transaction.** The client's own transaction
   (built against a throwaway simulation source, spec: "Clients MUST use
   a separate, funded G-account as the simulation source... never
   included in the signed authorization tree") can never simulate to
   success on its own, since `authorization.facilitator.require_auth()`
   is only satisfiable once the facilitator is the actual transaction
   source, which only happens after a rebuild. Simulating the client's
   payload as received always fails on that check alone, regardless of
   whether the buyer's own part is valid, confirmed via a real
   `Error(Auth, InvalidAction)` / "Unauthorized function call for
   address \<facilitator\>" before this was corrected.

Real end-to-end proof, not just unit tests against fakes: 16 new unit
tests in `upto-stellar-scheme.test.ts` cover every structural rejection
that doesn't need live RPC (protocol version, scheme, network, profile,
settlement-contract mismatches), and
`apps/facilitator/scripts/upto-http-route-settle-demo.ts` (mirrors
`settle-demo.ts`'s role for `exact`) drives a real signed `upto` payment
through this facilitator's own `core.verify()`/`core.settle()`, the same
entry points `/verify`/`/settle` call over HTTP, not the raw contract
client `upto-settle-demo.ts` already proved works. Settled for real:
[`35085ff714c5...`](https://stellar.expert/explorer/testnet/tx/35085ff714c54e591634cfe61c5f7d8b94e702aa6273005c29c9a0e369301829),
Horizon-verified via `/effects`, a genuine partial settlement (buyer
signed `0.1 PTEST`, facilitator settled `0.035`, buyer refunded `0.065`,
matching the pull-pay-refund sequence exactly), recorded in
`conformance/RESULTS.md`. `pnpm run ci` green throughout, 256 tests.
**Not yet reflected on the live `https://periplo-testnet.fly.dev`
deployment**: redeploying with `UPTO_SETTLEMENT_CONTRACT_TESTNET` set
needs `fly deploy`, and this session's `fly` CLI is authenticated as
`xvaiosx7@gmail.com`, which cannot see `periplo-testnet` in `fly apps
list`, the same recurring account gap `docs/DEFERRED.md` already
documents twice; needs the project owner to re-authenticate as
`ticketsafes@gmail.com` first, logged as a real blocker rather than
worked around.

**2026-09-01: the same `require_auth_for_args` expertise that built this
turned up a real limit on the mechanism itself, for a different scheme.**
`batch-settlement` (long-lived payment channels, deposit once, sign many
off-chain vouchers, redeem rarely) needs voucher signatures with no
meaningful expiry, which both the EVM and SVM bindings deliberately
provide. `require_auth_for_args` can't: the Soroban host hard-rejects any
`signatureExpirationLedger` beyond `current_ledger + max_entry_ttl - 1`,
confirmed live against real testnet (`stellar network settings --network
testnet`) at 180 days, not assumed or left at a research agent's ~1-year
guess, which was checked against the live network and corrected before
publishing. `upto` never hit this since its own authorizations only need
to survive minutes. Filed as
[x402-foundation/x402#3341](https://github.com/x402-foundation/x402/issues/3341)
with a real alternative sketched (raw `env.crypto().ed25519_verify()`,
already Stellar's own reference pattern), not a spec commitment. Full
writeup in `docs/SPEC.md`'s Phase 6 section.

**2026-09-01: a second, real maintainer review landed on #1672 itself,**
distinct from roebee's ongoing engagement on #1655/#1681/#1683. Ryang-21
left `CHANGES_REQUESTED` plus five inline comments, each naming a genuine
silent-signature-corruption or dead-end path on the new delegate-signing
surface, not a style nit: reusing a stale `expiration` default across
sequential multi-party signers silently invalidates an earlier signer's
signature (`Error(Auth, InvalidAction)` on the real host, no client-side
warning first, the same defect Copilot's own third open question, noted
above in the #1672 history, had already flagged); a missing
`!signer.signed` guard let a repeat `signAuthEntries()` call for an
already-signed address re-sign and re-bump the same shared expiration
through a second door; a contract-address (`C...`) delegate target
reached an unreachable `signatureScVal` branch, surfacing only an opaque
strkey error; a pre-#1672 custom `authorizeEntry` declaring 4 parameters
silently dropped the new `forAddress` (5th) argument, writing a
delegate's signature to the entry's top level instead of the delegate
node; and the #1683 fix belonged in `base/auth.ts` itself (one line, as
Ryang-21 specified exactly), not the narrower `assembled_transaction.ts`
workaround #1672 had shipped with. All five fixed in one commit,
`0dd1c624`, each with a dedicated new regression test — the
expiration-reuse test needed a mid-session rewrite from a passthrough
mock, which never actually exercised the already-signed check it was
meant to cover, to real signing via `contract.basicNodeSigner`, caught
before pushing. Merged `upstream/main` afterward (`81466fd9`, a merge
commit, not a rebase, so none of Ryang-21's existing comment anchors
moved) to pick up #1693/#1698, one `CHANGELOG.md` conflict resolved by
hand. Re-verified in full post-merge, not just the fix commit in
isolation: 132 test files, 6743 tests passing, `tsc -p tsconfig.json`
and `tsc -p test/tsconfig.json` both clean, `eslint src/` clean,
generated reference docs confirmed current by the repo's own pre-push
hook. Replied inline to each of the five review threads plus one summary
PR comment, each referencing the real commit rather than asserting the
fix happened. Signed and verified:
`gh api repos/Eras256/js-stellar-sdk/commits/81466fd9 --jq
'.commit.verification.verified'` returns `true`. CI (Tests, CodeQL, Docs
build, Code Formatting, Guide snippets, e2e) shows `action_required`,
confirmed via the Actions API rather than assumed from the check list
alone: the standard GitHub gate requiring a maintainer to approve
workflow runs on an external PR, not a failure on this branch. **Status:
all five of Ryang-21's review points fixed with dedicated tests and
evidence, merge conflict resolved and pushed, signed, nothing further
actionable from this side until a maintainer approves CI and review
resumes.** Copilot's first two open design questions from #1672's
earlier history (whether `needsNonInvokerSigningBy()` should exclude a
delegate an account's own policy may never require, and whether public
docs should describe contract-address delegates) remain genuinely open,
distinct from what Ryang-21's review covered.

**Resuming the broader search, same day, the same defect class recurred
independently in a different official SDK.** `StellarCN/py-stellar-base`'s
`authorize_entry()` (`stellar_sdk/auth.py`) signs each CAP-71-01 delegate
correctly in isolation, but sequential signing across multiple delegates
silently overwrites the entry's one shared `signature_expiration_ledger`
field, invalidating an earlier delegate's already-stored signature
whenever two calls use different expiration values, with no error raised
at either call. Two docstrings already state the requirement in prose
("every signer of one entry must use the same `valid_until_ledger_sequence`,
otherwise earlier signatures are invalidated"), but nothing in code
enforces it. `AssembledTransaction.authorize()`/`sign_auth_entries()`
never reach this path at all, only the top-level address, by explicit
design (`needs_non_invoker_signing_by()`'s own docstring: "delegate
signers ... are account-specific policy and are not reported"), so the
low-level `authorize_entry(..., for_address=...)` primitive checked here
isn't a fallback, it's the only documented way to sign a delegates entry
with this library. Reproduced for real against `a0e9f8b7` (the commit
last touching `auth.py`): two delegates signed with expirations 1000 and
2000, then the payload the network would verify the first delegate's
stored signature against (rebuilt from the entry's current state,
expiration 2000) compared byte-for-byte against the payload it was
actually signed with (expiration 1000), confirmed different by a real,
executed script, not reasoned about. Checked for duplicates first (none
found; `#1189`, the PR that added this support, has no discussion of
this case in its own review comments). Filed as
[StellarCN/py-stellar-base#1215](https://github.com/StellarCN/py-stellar-base/issues/1215)
with a proposed fix (raise a clear `ValueError` in `authorize_entry()`
when an already-partially-signed entry's stored expiration disagrees
with the value just passed, instead of silently overwriting it), not
just the finding. Severity calibrated the same honest way as #1655's own
entry above: CAP-71 isn't live on any network yet, so this has no impact
on a real transaction today, but the bug is real in code already
shipped, in the only path this library offers for it. No PR opened yet:
this repo's own `CONTRIBUTING.md` asks contributors to check in before
starting work on a significant change, so the issue carries a full fix
sketch instead, ready to turn into a PR once a maintainer responds.

`Dockerfile.facilitator` builds and ships `@periplo/bazaar` and
`@periplo/search` alongside `@periplo/facilitator`. Three things the image
needs or the deploy crash-loops: `pnpm --filter @periplo/bazaar build`
(and `@periplo/search`) before the facilitator build step (`tsc -p`
doesn't auto-build referenced projects), copying each package's
`node_modules` into the runtime stage, not just `dist/` (pnpm gives every
workspace package its own symlinks to its own deps, found live against
the real deployment on the first Phase 4 deploy), and setting
`ONNXRUNTIME_NODE_INSTALL_CUDA=skip` before `pnpm install` (fastembed's
`onnxruntime-node` dependency otherwise downloads a ~340MB CUDA binary on
Linux/x64 that this CPU-only deployment never uses, found by inspecting
`du -sh` on the installed package, not assumed from the install succeeding
quietly).

`README.md`, `docs/INTEROP.md`, and `docs/SELLERS.md` went through a full
prose-register pass early in the build (em dashes, negation-for-emphasis,
bold overuse removed; every fact and code block verified unchanged). Every
other markdown file in the repo later went through a narrower, em-dash-only
pass: `docs/DEFERRED.md`, `docs/MEMORY.md`, `docs/SPEC.md`, this file,
`docs/ECOSYSTEM.md`, `conformance/RESULTS.md`, `docs/SKILLS.md`,
`contracts/upto-settlement/README.md`, all four `conformance/baseline/`
transcripts, plus a follow-up fix to four leftover instances in `README.md`
and one in `docs/SELLERS.md` a repo-wide grep caught afterward. Same
discipline throughout (period, comma, or colon chosen per sentence, never a
blind find-and-replace) and same verification (every technical value, hash,
table, and code block diffed against `HEAD` before each commit), but not
the fuller negation/bold treatment the original trio got. The same
discipline has applied to every doc edit since: own prose gets rewritten
per-sentence, verbatim quotes from a reviewer's actual words (whawk46's,
in `README.md`, `docs/INTEROP.md`, and `docs/DEFERRED.md`) keep their
original em dashes exactly, on purpose, not missed.

**`grep -rlP '\x{2014}' --include="*.md" .` gives false positives in this
environment** and cannot be trusted, found checking this claim again
later: it flags dozens of files with no real em dash at all. Use the raw
byte sequence instead, `grep -rl $'\xe2\x80\x94' --include="*.md" .`,
confirmed to match the same three files the verbatim-quote exception
above names and nothing else.

**2026-08-17: a much larger pass than any of the above, and outside
markdown entirely.** The prior passes were scoped to `.md` files; a
repo-wide `grep -rl $'\xe2\x80\x94' .` (no `--include` filter) found 263
real occurrences across 53 files, almost all in TypeScript/Rust code
comments and a handful of config files (`.gitignore`, `.env.example`,
`fly.facilitator.toml`, `supabase/config.toml`, `.github/workflows/ci.yml`,
`pnpm-workspace.yaml`), a register this project's em-dash discipline had
never actually reached before. Also corrected two live, user-facing
strings caught in the same sweep: `GET /`'s `description` field and
`packages/licence-check`'s own CLI output. Fixed the same way as every
prior pass, verified per-instance via a script asserting each exact-match
replacement occurs exactly once before writing, not a blind regex sweep.
Final state confirmed via the real GitHub Contents API (not
`raw.githubusercontent.com`, which caches and gave a false "nothing
changed" reading once): 4 occurrences across 3 files, the same
whawk46-verbatim-quote exception named above, untouched.

`conformance/baseline/` holds real, captured HTTP transcripts (not
reconstructed from documentation) against the public reference facilitator
(`x402.org`). Treat it as the empirical spec for "conformant" that later
phases build against, regenerate/extend it when the reference
facilitator's behaviour changes, don't hand-edit the transcripts.
`conformance/RESULTS.md` is the evidence table of settled transaction
hashes, cross-checked against Horizon, not just printed and trusted.

**2026-09-02: Protocol 28 ("Adapter") readiness check, real testnet
verified against `stellar.org/blog/developers/adapter-protocol-28-upgrade-guide`,
two weeks ahead of the 2026-09-16 mainnet vote (`stellar network
settings --network testnet` confirms testnet has run it since
2026-08-27).** Three real actions, not just a version bump asserted
done:

1. **`@stellar/stellar-sdk` upgraded, but not to `latest`.** `17.0.1`
   is npm `latest`, but `@x402/stellar` (this project's own dependency,
   pinned `2.22.0`, and still true of the newest published `2.24.0`)
   hard-pins `"@stellar/stellar-sdk": "^16.0.1"`, so a v17 bump would
   split the install into two incompatible major versions of the same
   package (v17 rebuilt the entire `xdr` namespace on `@stellar/js-xdr`
   v5, a breaking change `@x402/stellar` hasn't adopted). Checked
   `pnpm-lock.yaml` directly for the real resolution, not assumed. The
   actual safe target, found reading the real `CHANGELOG.md` at the
   `v16.3.0` tag (not `main`'s, which has no `v16.3.0` section at all,
   an LTS-branch release): `16.2.0` → `16.3.0` backports the full
   Protocol 28 XDR schema (CAP-85's `ContractExecutableExternalRef`,
   CAP-83's `StellarValueEmptyTxSet`) onto the stable v16 API shape,
   `#1694`, "ported from #1665". One dependency bump
   (`apps/facilitator/package.json`), `pnpm install` deduped it to a
   single shared resolution satisfying both this project's own range
   and `@x402/stellar`'s, `pnpm run ci` green after, no code changes
   needed since it's purely additive. `contracts/*`'s `soroban-sdk`:
   left alone, correctly. No stable `28.x` exists yet on crates.io
   (`28.0.0-rc.1` is the newest, an RC, checked live), and no Rust code
   was touched this round, so there's nothing to rebuild against a
   version that doesn't exist as a release yet.
2. **`ContractExecutable` exhaustive-match check: doesn't apply to
   Periplo's own code, checked, not assumed.** A repo-wide grep (TS and
   Rust) for `ContractExecutable`, `CreateContractHostFn`, and
   `create_contract` returns nothing: `apps/facilitator` never inspects
   a contract's executable type (it calls already-deployed contracts,
   it never creates one), and neither does `contracts/upto-settlement`
   (its own `require_auth_for_args` covers only its own call's
   argument tuple, never a nested contract-creation sub-invocation).
   One real, adjacent finding worth naming, not Periplo's own code:
   OpenZeppelin's `stellar_accounts::smart_account::storage::
   get_validated_context_by_id` (the function `contracts/
   agent-smart-account`'s `__check_auth` delegates to entirely) does
   match on `Context::CreateContractHostFn`/`CreateContractWithCtorHostFn`
   with a pattern that destructures `executable: ContractExecutable::Wasm(wasm)`
   specifically — read directly from the real source at the pinned
   `stellar-accounts@0.7.2` tag. Not currently broken: `agent-smart-account`
   pins `soroban-sdk = "26.1.1"`, whose own `ContractExecutable` enum
   (checked directly) has exactly one variant, `Wasm`, so the match is
   trivially exhaustive today and compiles fine. It would need a real
   fix from OpenZeppelin's side (a wildcard arm, or explicit handling)
   the day `stellar-accounts` itself moves to a soroban-sdk version
   whose `ContractExecutable` has more than one variant, unrelated to
   whether Periplo's own `agent-smart-account` bumps its pin. Not filed
   from this session: `agent-smart-account` is Phase 6b research with
   no live testnet transaction ever achieved (`#839`, below), so this
   doesn't change any deployed or working code path, and Nirium (same
   GitHub identity, a separate project, real Stellar/x402 work of its
   own) hit the identical root cause independently the same day, with a
   materially stronger repro: an actual minimal crate compiled against
   both `soroban-sdk = "27.0.2"` (clean) and `"28.0.0-rc.1"` (real
   `error[E0004]: non-exhaustive patterns`), not just source-reading.
   Filed as
   [OpenZeppelin/stellar-contracts#865](https://github.com/OpenZeppelin/stellar-contracts/issues/865).
   Periplo's own case doesn't get a separate issue, that would be a
   duplicate of a stronger repro of the same bug; instead, [a
   corroborating comment](https://github.com/OpenZeppelin/stellar-contracts/issues/865#issuecomment-5515054181)
   on `#865` itself notes the second, independent hit at a different
   `soroban-sdk` pin (`26.1.1` here vs. `27.0.2` there), the same
   underlying gap surfacing regardless of which pre-28.x pin a project
   happens to be on.
3. **Real testnet cycle run under Protocol 28, not just asserted
   compatible.** `exact` (`settle-demo.ts`), `upto`'s `contract`
   profile direct against the deployed contract
   (`upto-settle-demo.ts`), and `upto`'s `contract` profile through
   this facilitator's own HTTP-route code path
   (`upto-http-route-settle-demo.ts`) all settled for real, each
   independently confirmed on Horizon (`successful: true`, source
   account the fee-sponsor), recorded in `conformance/RESULTS.md`. One
   real bug found and fixed along the way: `settle-demo.ts` had never
   read `MAX_TRANSACTION_FEE_STROOPS` the way `serve.ts` does, so it
   used the SDK's stale 50,000-stroop default and failed on the real,
   current testnet fee (`95,461` stroops that day, confirmed live,
   already above the `72,000` that first motivated the override on
   2026-08-19), fixed by reading the same env var. `upto`'s own
   300,000-stroop default already covered the current fee, no change
   needed there. The `smartAccount` profile (`agent-smart-account`)
   was not attempted: it has never produced a real signed testnet
   transaction at all (`__check_auth` traps, `#839`), a blocker
   unrelated to Protocol 28 specifically, and re-attempting it isn't
   "running an existing cycle," it's reopening a closed diagnostic
   round without the new concrete trigger the standing instruction
   requires.

**2026-09-03: channel-account pool, spec §2/§7's sequence-number
bottleneck under bursty traffic, pulled forward from Phase 10 at
explicit request, same pattern as the Fly.io deploy in Phase 3.**
`@x402/stellar`'s own `ExactStellarScheme` (and this project's own
`UptoStellarScheme`, deliberately mirroring it) already accept an array
of signers and round-robin across them (`selectSigner`, default
round-robin), using the selected signer's own account, and so its own
sequence number, as the rebuilt transaction's source, confirmed reading
the real compiled source (`server.getAccount(signer.address)`), not
guessed. Configuring a pool was the whole gap: `core.ts`'s prior shape
only ever passed one signer per network. `createFacilitatorCore`'s new
`channelAccountSecrets` option (`serve.ts`'s
`STELLAR_CHANNEL_ACCOUNT_SECRETS_TESTNET`/`_PUBNET`, comma-separated,
optional) pools N extra signer accounts per network on top of the
primary, each checked by the same `assertNonCustodialSigner` boot-time
gate as the primary, one call per pool member. Found and fixed a real,
adjacent design issue while building this, not before: the prior
one-shared-scheme-instance-across-all-configured-networks shape
(harmless only because production has only ever configured one network
at a time) would have let the round-robin pick a *pubnet* signer for a
*testnet* settlement or vice versa once both networks were configured
together, since `selectSigner` has no network awareness of its own.
Fixed by constructing one `ExactStellarScheme`/`UptoStellarScheme`
instance **per network**, each registered only for its own network, each
built from only its own pool — not a fund-safety bug (the mismatched
account simply doesn't exist on the wrong network's RPC, so settlement
fails closed), but a real availability hazard closed as a side effect.

Real evidence, not just configured: 3 fresh testnet channel accounts
generated and funded via friendbot
(`GAZROUSFXRTCDUWL6HDGQDFAL5V2VZOQF25RYESIKZPHZQREPY7MWARE`,
`GCGA5WSVEEEVNNZ37ADIUZ5YO3UE6NLNA7EH7W4NG3PM5H7GRXXV7545`,
`GDOKGMQP4TYKJ6ZMDYTCIWQAV5BUTG5KJ2PCUJ4OQ6YS466IWBEDHJVV`), pooled with
the primary fee-sponsor (4 total).
`apps/facilitator/scripts/channel-accounts-burst-demo.ts` fired 4
concurrent `settle()` calls against the 4-member pool: all 4 succeeded,
landed in the **same ledger** (`4490654`), and Horizon confirms all 4
used different source accounts, genuine concurrent settlement with zero
serialization, recorded in `conformance/RESULTS.md`. A follow-up run
deliberately oversubscribed the pool (5 concurrent calls against 4
accounts): 4 succeeded, 1 failed cleanly with
`settle_exact_stellar_transaction_submission_failed` (a sequence
collision on the account the round-robin wrapped back onto) — the
honest, expected limit, reported as such rather than hidden:
concurrency safety extends exactly to pool size, and oversubscription
fails closed per colliding call, not systemically. 5 new unit tests
(`core.channel-accounts.test.ts`, throwaway keypairs, no live network),
`pnpm run ci` green throughout, 263 tests. Not yet configured on the
live `https://periplo-testnet.fly.dev` deployment (same optional,
additive pattern as `upto`; the facilitator boots and serves fine
without it), tracked in `docs/DEFERRED.md`.

**Same day: `GET /status`, spec §8/§9/§10's operational telemetry
endpoint (uptime, latency p50/p95, error rate, catalog size, last
settled transaction per network), also pulled forward from Phase 10/
Phase 9 at the same request.** A JSON endpoint on `apps/facilitator`
itself, not the full `apps/hub` `/status` page spec §10 describes (that
page would render this data; `apps/hub` itself is still Phase 9,
genuinely not started, no invented scope here). `apps/facilitator/src/telemetry.ts`
is a small in-process tracker (`createTelemetryTracker`): a global Hono
middleware (`app.ts`) times every request and records whether it errored
(status ≥ 400), a bounded ring buffer (1,000 samples) backs the p50/p95
estimate, and `/settle` calls `telemetry.recordSettlement(network,
transaction)` on real success, the same "settle-only, not verify"
cataloging gate this file already documents applying here too. In-memory
by design, not persisted (spec §9 asks for aggregate operational metrics,
not a durable time series; resets on restart, an honest limitation, not
a bug, noted in the module's own doc comment). Catalog size is a new
`countCatalogResources` export from `packages/bazaar` (PostgREST's
`{ count: "exact", head: true }`, no rows fetched); both it and the
whole route degrade to `null`/no request rather than 500ing if no
`catalogClient` is configured or the count query itself fails, same
posture `/discovery/*` already uses. Verified live, not just unit
tested: booted `serve.ts` locally against the real fee-sponsor env, hit
`/health` a few times, confirmed `/status` reporting real
`requestsServed`/latency numbers that moved between calls. 15 new unit/
route tests (`telemetry.test.ts`, `catalog.test.ts`'s new
`countCatalogResources` cases, `app.test.ts`'s new `GET /status`
describe block), `pnpm run ci` green throughout, 278 tests. Not yet on
the live `https://periplo-testnet.fly.dev` deployment (a redeploy is
needed either way; tracked alongside the channel-account pool above in
`docs/DEFERRED.md`, not a separate blocker).

**Same round: `GET /demo/play`, a wallet-less one-click demo, also
pulled forward from Phase 9/10, real interoperability proof
(`interop-x402-org-demo.ts`) added the same round, and a real RFP
requirement mapping written (`docs/RFP-COMPLIANCE.md`), all three
prompted by a competitor comparison (Vellar-Wallet, discussed in chat,
not named in the public repo per the standing competitive-analysis
rule).** Real problem found before writing any code: a fresh browser
keypair funded via friendbot has native XLM only, never a custom asset,
so it can't pay `/demo/temperature-convert`'s `PTEST`-denominated price
without a trustline and a balance neither friendbot nor the visitor can
provide. `apps/facilitator/src/demo-faucet.ts`'s `prepareFaucetTransaction`
solves this without ever touching the visitor's secret: one transaction
with two operations (`changeTrust`, source: the visitor's key;
`payment`, source: this project's own `PTEST`-holding faucet, reusing
`STELLAR_TEST_BUYER_SECRET` rather than provisioning a second secret for
the same testnet-only purpose), signed server-side by the faucet only;
the browser adds its own signature and submits directly to Horizon
itself, so the ephemeral secret never reaches this server.
`apps/facilitator/src/browser/` (`demo-play-client.ts`'s `runDemoPlay`,
`demo-play-main.ts`'s thin DOM wiring) is a genuinely new browser-target
build: `demo-play.ts` bundles it with `esbuild` in-process at first
request (cached in memory, not a committed artifact, not rebuilt per
request), served at `GET /demo/play` (the page) and
`GET /demo/play/client.js` (the bundle). Required its own nested
`src/browser/tsconfig.json` (DOM lib, excluded from the main package's
Node-targeted build/emit, still type-checked via project references) —
found live, not assumed, when `pnpm typecheck` failed on `document`/
`window`/`HTMLElement` against the base Node-only `lib`.

Wire format (`PAYMENT-SIGNATURE` request header, `PAYMENT-REQUIRED`/
`PAYMENT-RESPONSE` response headers, all `base64(JSON.stringify(...))`)
read directly from the installed `@x402/core@2.22.0`'s own compiled
source before writing any browser code, not assumed: x402 v2 uses
`PAYMENT-SIGNATURE`, **not** `X-PAYMENT` (the v1 fallback), a real
correction to how this feature was originally specified in chat.
Verified for real, twice, end to end from Node before trusting the
browser bundle at all (`scripts/demo-play-full-verify.ts`): a fresh
ephemeral keypair, friendbot-funded, onboarded via the faucet
transaction, paid `/demo/temperature-convert` for real, settled,
Horizon-confirmed, `payer` in the settlement result matching the
one-time key. Measured wall-clock, both runs: **~15 seconds**, not the
"under 10 seconds" a first framing of this feature assumed — Stellar's
own ~5-second ledger close time, multiplied across three sequential
real transactions (friendbot, onboarding, the actual payment), makes
single digits physically unreachable on testnet regardless of code
efficiency; corrected in README rather than silently built to a target
that couldn't be hit.

Real interoperability evidence, distinct from the demo above:
`scripts/interop-x402-org-demo.ts` built and signed a payment with this
project's own client code, then verified and **settled it through
`x402.org`'s own independent, third-party reference facilitator**, not
this project's, confirmed live beforehand (`GET /supported` still lists
`exact`/`stellar:testnet`/`areFeesSponsored:true`) and independently
confirmed on Horizon afterward: the settling transaction's source
account is x402.org's own fee-sponsor, not Periplo's. Recorded in
`conformance/RESULTS.md` alongside the demo-play evidence.

`docs/RFP-COMPLIANCE.md` maps the real RFP Track requirements and
X402-specific evaluation criteria (quoted from the SCF Handbook's own
RFP Track page, fetched and checked live, not from a stale memory of
it) to real evidence already in this repo, row by row, every genuinely
open item named rather than implied covered. Explicitly does **not**
use the section numbers ("3.2", "3.5", "3.6") the competitor-comparison
prompt cited: traced those to Periplo's own internal budget table's
person-weeks column (a coincidental "3.5" for an unrelated line item,
"Conformance + e2e both networks"), not any real RFP clause structure,
confirmed by fetching both the build prompt and the live SCF Handbook
page rather than assumed correct. Corrected in the response to the
user rather than silently building a mapping around invented numbers.

Playwright (`@playwright/test@1.62.1`, matching `docs/SPEC.md`'s own
Phase 9 pin) added as a devDependency; a real Chromium is cached in
this environment, but the system shared libraries it needs to actually
launch (`libnspr4`, `libnss3`, others) aren't installed and there's no
root access in this session's sandbox to install them.
`scripts/demo-play-browser-verify.mjs` is real, correct, ready to run
in any environment with a working Chromium (or CI, which typically has
these preinstalled) — it was written and is believed correct, but has
**not actually been run successfully against a real browser this
session**, an honest, stated gap, not smoothed over: DOM wiring is
low-risk (a button click calling already-proven logic), but "low-risk"
is not "verified." 25 new tests across `demo-faucet.test.ts` (a real
testnet integration suite, gated on `STELLAR_TEST_BUYER_SECRET`, proves
the faucet transaction's structure and signatures without spending
anything) and `demo-play.test.ts` (route-level, Hono's in-memory
`app.request()`), `pnpm run ci` green throughout, 290 tests. Not yet on
the live `https://periplo-testnet.fly.dev` deployment, same recurring
Fly account gap as the two items above.

**Same day, resolved: the Fly account gap, a real deploy, and two more
real bugs found live.** The user re-authenticated `fly` as
`ticketsafes@gmail.com` (this session's own CLI had been on
`amadoregios@gmail.com`, a *third* distinct account from the two
`docs/DEFERRED.md` already tracked recurring). Secrets staged
(`STELLAR_TEST_BUYER_SECRET`, `STELLAR_CHANNEL_ACCOUNT_SECRETS_TESTNET`)
and `fly deploy` run for real. First bug, caught before deploying, not
after: `demo-play.ts` resolves its esbuild entry point relative to its
own `import.meta.url`, correct under `tsx` in dev (`src/demo-play.ts`
and `src/browser/` are real siblings) but broken in the compiled
`dist/` the Docker image actually runs, since `src/browser` is
deliberately excluded from the facilitator's own Node-targeted `tsc`
build. Fixed in `Dockerfile.facilitator` itself
(`RUN cp -r apps/facilitator/src/browser apps/facilitator/dist/browser`,
commit `4954869`), verified by rebuilding the real compiled output and
running the actual `dist/serve.js` (not `tsx`) locally before ever
deploying — confirmed the exact ENOENT this would have caused in
production. Deployed; live verification against the real URL confirmed
`GET /supported` listing all 4 channel-pool signer addresses and
`GET /demo/play`/`GET /demo/play/client.js` both serving correctly.

Second bug, found live, not before: `apps/facilitator/scripts/demo-play-full-verify.ts`
run against the real live URL settled a real transaction
([`40b489d4...`](https://stellar.expert/explorer/testnet/tx/40b489d462d717083ce2bd50d9f61c2ce9f1e3c7432fb96464e573e319d7cb50)),
but `GET /status` still showed an empty `lastSettledTransaction`
afterward. Root cause: `telemetry.recordSettlement` was only wired into
`app.ts`'s own `POST /settle` HTTP route; self-facilitation
(`demo-resource.ts`, the exact path `/demo/play` pays) never calls that
route, settling in-process via `x402ResourceServer`'s own
`onAfterSettle` hook instead, which already existed for bazaar
cataloging but never recorded telemetry and was incorrectly gated on
`catalogClient` being configured at all. Fixed by passing the same
`TelemetryTracker` into `mountDemoResource` and recording the
settlement unconditionally on success, before the cataloging-specific
logic (commit `9f0067a`, new regression test in
`demo-resource.test.ts`). Redeployed, re-verified live: a second real
settlement
([`10a46759...`](https://stellar.expert/explorer/testnet/tx/10a467594be999d7fe3cc82b08c924c7555b5db841f070759507749a5a6b198b))
now shows up correctly in the live `GET /status` response. All three
features from this round — channel-account pool, `/status`, `/demo/play`
— are genuinely live on `https://periplo-testnet.fly.dev` as of this
writing, not just merged. Full evidence in `conformance/RESULTS.md`.

## Working rules (spec §12)

- One phase per session block; report the gate command and its exit code
  before moving to the next phase.
- Never claim a passing test that wasn't actually run, paste real output.
- If a documented API or tool doesn't behave as `docs/SPEC.md` describes,
  trust reality: note the divergence in the commit body and in
  `docs/DEFERRED.md`, and continue, don't stall on it.
- When genuinely blocked (missing credentials, or an outward-facing action
  like a repo push or external account creation that needs a human's
  go-ahead), log it in `docs/DEFERRED.md` and keep going on everything that
  doesn't depend on it.
- Commit at every gate, conventional-commit format. The history is a
  reviewed deliverable, not just a log.
- This account also runs other projects (Nirium, Contextio, Kumply, and
  others) from the same GitHub identity and the same machine. When
  determining which project a piece of external work (a PR, an issue, a
  local checkout) actually belongs to, the user's own tracking record is
  the authority, not an incidental technical signal: a shared local
  directory path, or a user-level config file like
  `~/.claude/plugins/known_marketplaces.json`, is not scoped to one
  project and can't settle the question either way. Ask rather than
  infer from machine state alone.
- A CI gate failing on a commit that didn't touch related code is not
  evidence of flakiness; it's a prompt to find the real cause before
  re-running. `eval/` shares the production Supabase project with no
  isolated database (`docs/DEFERRED.md`), so two `pnpm eval` runs close
  together in time can race the same fixture rows; a real instance of
  this collapsed nDCG@10 from 0.93 to 0.21 on 2026-08-31, on a
  docs-only commit, and would have looked like ordinary flakiness to a
  blind re-run. Compare the failing run's own timestamps against the
  runs immediately before and after it (`gh run list`, `gh run view
  --log`) before assuming noise.
- Any PR opened against an upstream repo that requires signed commits
  (confirmed so far: `x402-foundation/x402`) must be signed from the
  commit that creates the branch, not fixed up after the fact. A
  dedicated SSH signing key already exists at
  `~/.ssh/id_ed25519_signing`, registered on Eras256's GitHub account;
  set `gpg.format ssh`, `user.signingkey`, `commit.gpgsign true` (local
  to that clone) before the first commit. Verify with `gh api
  repos/<owner>/<repo>/commits/<sha> --jq
  '.commit.verification.verified'` and `gh pr checks <n>` for
  `check-verified-commits` passing. `git log --show-signature` alone
  is not reliable: it reports "No signature" whenever
  `gpg.ssh.allowedSignersFile` isn't configured locally, even when the
  commit really is signed. Don't report a PR as finished until checks
  are actually green, not just until `gh pr create` returns a URL.
- Local commit state is not remote state, and a prior read of an
  external source is not the source. Recurred twice on 2026-09-01: docs
  committed locally and reported as pushed before `git push` had
  actually run, caught by the user checking `origin/main`, not by this
  session; and an external issue's real title was misdescribed in
  conversation from a partial recollection rather than a fresh re-check.
  Before reporting a commit as pushed, `git fetch` and compare against
  `origin/<branch>` (or `gh api repos/<owner>/<repo>/commits`), not just
  local `git log`. Before citing or paraphrasing any external issue,
  PR, or file, re-fetch it the same turn, even if already read earlier
  in the session.

## Environment notes specific to this machine

See [`docs/TOOLING.md`](docs/TOOLING.md#environment-notes-specific-to-this-machine)
for machine-specific setup: `docs/DEFERRED.md`'s role as the
environment-divergence log, the `docs/SKILLS.md` phase map, the
`docs/ECOSYSTEM.md` snapshot caveat, `docs/MEMORY.md`'s role as decision
log, and the local Codex config note.
