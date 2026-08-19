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

Requires Node ≥22, `pnpm@11.20.0` (pinned). Use `pnpm run ci`, not bare
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
`apps/facilitator`, and `eval/` exist so far (Phases 0–5). Everything else
in the target layout (`apps/hub`, `packages/mcp`, `packages/helpers`,
`contracts/`, `spec/`, `conformance/` runner, `examples/`) is **planned,
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
`lightningcss` (MPL-2.0), unavoidable while pinning `vitest@4.1.10` but
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
wires this into `/verify` and `/settle`, cataloging only runs after the
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
the module's own doc comment. `/supported` still can't report `upto`,
that needs a real `UptoStellarScheme` registered against
`x402Facilitator`, not a wiring fix, tracked open in `docs/DEFERRED.md`.

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
silently. `src/test.rs` (21 unit tests) and `src/property_test.rs` (6
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
`apps/facilitator`'s own `/verify`/`/settle` HTTP routes (the TypeScript
client/facilitator package mirroring `@x402/stellar`'s `exact`
implementation, per spec §6's "prepare the upstream contribution as
`typescript/packages/mechanisms/stellar/src/upto/`") is separate,
not-yet-started work, this phase's gate is the contract itself, not that
integration; see `docs/DEFERRED.md`.

**Phase 6b** (`contracts/agent-verifier`, `contracts/agent-smart-account`,
`contracts/upto-settlement/src/budget.rs`) is additional evidence beyond
Phase 6's own gate, not an SCF tranche deliverable, same treatment as
Phase 4/5/6: zero-settlement is done and evidenced (a real
`actual_amount = 0` transaction, full refund, nonce still consumed,
recorded in `conformance/RESULTS.md`); the OpenZeppelin `stellar-accounts`
smart-account integration (an agent key that can only spend through
`UptoSettlement`, within a reserved budget reconciled against the actual
charge) is built and unit-tested at the contract level but has **no real,
signed testnet transaction yet**, a genuinely open blocker, not a silent
gap. `__check_auth` traps (`UnreachableCodeReached`) on every construction
tried: `Signer::Delegated` (the original attempt) and `Signer::External`
(the retry, informed by reviewing `authenticate`'s two arms in
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
[OpenZeppelin/stellar-contracts#839](https://github.com/OpenZeppelin/stellar-contracts/issues/839),
framed as a request for diagnostic help, open. This diagnostic round is
closed on purpose (the user's own instruction: don't reopen #839 with
another angle without a new concrete trigger); further attempts get their
own separately-scoped investigation.

Reviewing the dependencies this project actually builds on, both directly
from the #839 investigation and in separately-scoped bug-hunting rounds
afterward, turned up six more real, independently verified upstream
bugs, all filed, all still open as of this writing:
[x402-foundation/x402#3169](https://github.com/x402-foundation/x402/issues/3169)
(`isValidRouteTemplate`'s traversal/scheme-injection checks decode once,
so double percent-encoding bypasses both),
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
cold), alongside the earlier `mcp://` canonical-URL bug (#3121, fix at
#3138, open, LGTM'd twice, blocked only on maintainer merge). Each was
verified directly against the real published package before filing, not
asserted from reading the source alone; severity was calibrated honestly
in every case (none of the six is a security vulnerability, all fail
closed or degrade functionally, stated as such in the issue itself). Two
adjacent projects' repos
(`Vellar-Wallet/vellar-facilitator`, `Ithaca-Labs/openx402`) were read for
architectural understanding only, during the #839 investigation, and
explicitly excluded from every later bug-hunting round; both are direct
competitors for the same SCF RFP, so their code was never copied and
neither repo was ever commented on or interacted with publicly, per
explicit standing instruction.

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

## Environment notes specific to this machine

See [`docs/TOOLING.md`](docs/TOOLING.md#environment-notes-specific-to-this-machine)
for machine-specific setup: `docs/DEFERRED.md`'s role as the
environment-divergence log, the `docs/SKILLS.md` phase map, the
`docs/ECOSYSTEM.md` snapshot caveat, `docs/MEMORY.md`'s role as decision
log, and the local Codex config note.
