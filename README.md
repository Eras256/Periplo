# Periplo

[![CI](https://github.com/Eras256/Periplo/actions/workflows/ci.yml/badge.svg)](https://github.com/Eras256/Periplo/actions/workflows/ci.yml)

The discovery layer for x402-payable services on Stellar.

**Live now:** [periplo-testnet.fly.dev](https://periplo-testnet.fly.dev),
the facilitator running on `stellar:testnet`. Try
[`GET /`](https://periplo-testnet.fly.dev/) or
[`GET /supported`](https://periplo-testnet.fly.dev/supported) directly,
no setup required.

**The Bazaar has a real external seller in it, not just our own demo
resource.** [`agentpayments.fi`](https://agentpayments.fi) built its
own resource server, pointed it at this facilitator, and settled a real
payment on `stellar:testnet`, no coordination beyond following
[`docs/SELLERS.md`](docs/SELLERS.md). Try
[`GET /discovery/search?query=conformance`](https://periplo-testnet.fly.dev/discovery/search?query=conformance)
directly: their resource is the top result, alongside ours, found by a
buyer who has never seen either service before. This is what the
catalog is for, demonstrated by someone who isn't us.

**Reviewing this for the RFP round?**
[`docs/FOR-REVIEWERS.md`](docs/FOR-REVIEWERS.md) is a ten-minute,
human-written path through this repo, not written for a Claude Code
session the way `CLAUDE.md` is.

**Status: Phase 6, the `upto` Soroban contract, is complete.** The
facilitator is live on `stellar:testnet` at
[periplo-testnet.fly.dev](https://periplo-testnet.fly.dev). The rest of
Phase 10 is not done; see [`docs/DEFERRED.md`](docs/DEFERRED.md). This
README states what is built, linked, tested, or hashed today. Everything
else is marked as planned.

**There is no frontend yet.** The developer hub (`apps/hub`) is Phase 9
and has not started. `/browse`, `/playground`, `/status` and the rest of
§10's routes do not exist. The facilitator's JSON API is the only
user-facing surface right now.

## The ecosystem is converging on this spec, not the other way around

Twenty-plus real teams are competing for the same SCF #45 award. Here is
the one thing none of the others can currently show with real, linked
evidence: two direct competitors in the same round chose to build on the
`upto` payment spec this project opened upstream
([x402-foundation/x402#3098](https://github.com/x402-foundation/x402/pull/3098)),
rather than fork their own.

- **Rialto** ([Iam0TI](https://github.com/Iam0TI), `0d1026/Rialto`)
  opened a competing design against the same spec file
  ([`#3134`](https://github.com/x402-foundation/x402/pull/3134), the
  `stateless` profile). It was credited and merged into `#3098` as a
  second named profile, not left as a rival PR for maintainers to
  arbitrate between.
- **AutoLayer** (`autolayer-labs`) engaged the same `#3098` thread and
  said directly that it "will not open a third competing spec PR,"
  committing instead to implement whichever profile maintainers select
  and to send an implementation PR against the converged spec rather
  than a document of its own.

Neither commitment came from us asking; both are quoted, dated, and
linked, not paraphrased. Full chronological writeup, every link and
finding sourced rather than restated, is in
[`docs/UPTO-CONVERGENCE.md`](docs/UPTO-CONVERGENCE.md).

A third, different kind of external signal landed on the same thread on
2026-08-21: an independent implementer unaffiliated with this project,
`davedumto`, [reviewed five real Stellar `upto` implementations in
source](https://github.com/x402-foundation/x402/pull/3134#issuecomment-5373783683)
(rail402, Rialto, openx402, LumenGate, and this project's contract via
`#3098`) against a proposed reconciliation of the spec, and named this
contract's own handling of nonce-TTL replay as one of the cases the
merged spec should require every implementation to answer correctly.
It already does, verified live on testnet, not just asserted; full
technical detail in [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md#independent-external-validation-of-the-replay-row-2026-08-21).
This is the kind of evidence no competitor can manufacture: an
unsolicited, source-level review from someone outside the project,
not self-assessment. **As of 2026-08-23**, that thread is still active
(Rialto and davedumto continuing to work through interop details like
`autoRevoke` defaults and nonce-TTL edge cases) and `#3134` itself
remains open and unmerged, not yet resolved.

**2026-08-25:** a separate, unrelated fix fed back into this same
convergence story. Moving our own facilitator's catalog to settle-only
(the "Automatic cataloging" bullet below, prompted by
[x402-foundation/x402#3226](https://github.com/x402-foundation/x402/issues/3226))
turned up that pedro-pelicioni's stellarsight facilitator had
independently reached the same settle-only reading. We cited that
convergence, not as an isolated technical note but as further evidence
for this section's own thesis, in a nudge on
[stellar/x402-stellar#72](https://github.com/stellar/x402-stellar/issues/72#issuecomment-5418484702)
asking directly whether `#3098` or `#3134` is what the wire spec
consolidates onto. **Answered the next day**: bomanaps recommended
consolidating on `#3134`, backed by real evidence (signed commits, a
deployed contract exercised on testnet for both G-account and
C-account payers, 7 of 7 tests passing), and bomanaps and
[davedumto](https://github.com/x402-foundation/x402/pull/3134#issuecomment-5373783683)
(a third independent reviewer who compared five real Stellar `upto`
implementations in source) have since agreed on a concrete structure
for the merged document. Full, sourced chronology in
`docs/UPTO-CONVERGENCE.md`.

Also responded on `#3098` itself to pedro-pelicioni's pricing-metadata
proposal for the bazaar extension
([`#3181`](https://github.com/x402-foundation/x402/pull/3181)):
acknowledged it as complementary to `upto`, not competing, and corrected
our own earlier speculation once the actual design was published,
`pricing` lives at a different level of the wire structure than our own
dedupe key needs, so it doesn't solve that specific problem the way we'd
guessed it might, not a flaw in the proposal itself. Full writeup in
`docs/UPTO-CONVERGENCE.md`.

**2026-09-01: past "two competitors build on our spec" to "we found a gap
neither of them saw, because we're the only one who actually built the
hard part."** Both `#3098` and `#3134` claim Stellar C-accounts are
supported "transparently" by the one Soroban mechanism (
`require_auth_for_args`) that makes `upto` expressible at all. That claim
is verified for a C-account whose own `__check_auth` signs directly. It
is not verified for a delegated or session-key smart-account signer, the
pattern an autonomous agent actually needs: a scoped key, gated by the
account's own spending policy. This project already tried to build
exactly that, in Phase 6b, and hit a real wall no one else in either
thread has hit or documented: `__check_auth` traps unreachable on every
construction tried, seven ruled-out hypotheses, filed as
[OpenZeppelin/stellar-contracts#839](https://github.com/OpenZeppelin/stellar-contracts/issues/839),
still open. Rewrote `#3098` to state the caveat plainly rather than let a
reviewer implement against an unqualified claim, and to actually
implement the maintainer-agreed consolidation structure (`stateless` as
the base profile, `contract` as the secondary profile carrying required
test vectors) that had otherwise sat agreed-but-undrafted for five days.
Commit signed and verified, `check-verified-commits` passing, full
writeup with the exact evidence in `docs/UPTO-CONVERGENCE.md`.

**Same day, a second finding, this time about settlement rather than
authentication.** `batch-settlement` has no Stellar network binding
upstream at all yet, EVM and SVM only. Its whole design needs voucher
signatures with no meaningful expiry, deliberately provided by both
existing bindings. `require_auth_for_args`, the exact mechanism that
makes `upto` work, cannot provide that: the Soroban host hard-rejects
any signed authorization whose expiration exceeds 180 days out,
confirmed directly against real testnet
(`state_archival.max_entry_ttl`), not assumed. `upto` never hit this
limit since its own authorizations only need to survive minutes, not
the months or years a long-lived payment channel implies. A real
alternative exists and is precedented, not invented: raw Ed25519
signature verification, already Stellar's own reference pattern in
`rs-soroban-env`'s own example contract, matching what Solana's binding
already does for the identical reason. Filed as
[x402-foundation/x402#3341](https://github.com/x402-foundation/x402/issues/3341)
with a sketch of the direction, not a spec commitment. Two structurally
different findings in one day, both requiring the same thing: having
actually built `require_auth_for_args`-based settlement on Soroban, not
read about it.

## What's real right now

- Monorepo tooling: pnpm workspaces, TypeScript 7 (strict,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest,
  Biome, GitHub Actions CI.
- [`packages/licence-check`](packages/licence-check) is the CI gate. It
  fails the build on any AGPL or copyleft transitive dependency
  (constraint: spec §1). It is unit-tested, including the exact
  AGPL-3.0-or-later case the spec names: the OpenZeppelin Relayer
  license.
- [`packages/evidence-check`](packages/evidence-check) is a second CI
  gate: on every push, it re-fetches every transaction hash cited below
  from Horizon, re-checks every cited GitHub issue/PR against the GitHub
  API, and re-confirms every internal doc link still resolves, so this
  evidence table is a self-auditing claim, not a photograph of the day it
  was written. [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md) formalizes
  the spec §6 threat/control/test table into its own citable file, each
  row pointing at the real code and test behind it.
- [`packages/bazaar`](packages/bazaar) is the catalog trust boundary.
  `checkRouteTemplate` decodes a route template fully, then rejects path
  traversal, absolute URLs, protocol-relative paths, backslash traversal,
  null bytes, and malformed or overlong encoding. Decoding before
  checking is what stops bypasses like `%2e%2e` and
  `/%2f%2fevil.example` against a naive check. `softDropFields` keeps
  every metadata field that validates and drops only the ones that fail,
  so one bad field never rejects the whole listing. 45 unit tests
  exercise `checkRouteTemplate` alone; the gate requires ≥20. The whole
  repo has 156 tests as of Phase 5, including the live-Supabase
  integration suites, counted with a fresh `pnpm run ci` run.
- [`conformance/baseline/`](conformance/baseline) holds real, captured
  HTTP transcripts against the public `x402.org` reference facilitator:
  its `/supported` response for `stellar:testnet`, confirming
  `extra.areFeesSponsored: true`, and confirmation that it has no
  discovery (Bazaar) endpoints today. That gap is what this project
  fills.
- [`supabase/migrations`](supabase/migrations) holds the live catalog
  schema on a real Supabase project: the `resources` table, its
  full-text (`gin`) and vector (`hnsw`) retrieval indexes, and
  row-level security. Reads are public. Writes go through the service
  role only, verified with automated tests that run against the real
  project. See [`packages/bazaar/src/db`](packages/bazaar/src/db) for
  the typed client.
- [`apps/facilitator`](apps/facilitator) implements `verify`, `settle`,
  and `supported` for the `exact` scheme, built on `@x402/core` and
  `@x402/stellar`. Settlement logic comes from those packages. It also
  now implements `upto` (`src/upto-stellar-scheme.ts`, since no
  published `@x402/stellar` class exists for it), registered the same
  way. A **real settled transaction on `stellar:testnet`** for each
  scheme is recorded in
  [`conformance/RESULTS.md`](conformance/RESULTS.md), with every hash
  checked independently against Horizon. `upto` isn't configured on the
  live deployment yet (`docs/DEFERRED.md`). It is importable as a library,
  with no HTTP hop required, for self-facilitation inside a resource
  server, walked through end to end (a real, working example, not just
  described) in [`docs/SELF-FACILITATION.md`](docs/SELF-FACILITATION.md).
  It also ships as a Hono app for hosted or self-hosted use. **It
  is live at https://periplo-testnet.fly.dev**: try `GET /`,
  `GET /health`, or `GET /supported` directly. `stellar:pubnet` is not
  configured because no mainnet key exists yet. See
  [Deployment](#deployment-what-actually-runs) below for how it runs.

  Beyond our own settlement scripts, the **official x402 e2e conformance
  suite** (`x402-foundation/x402`'s own `e2e/`, not a Periplo-authored
  equivalent) was run end to end against the live deployment above via its
  documented `external-proxies` mechanism: real `typescript/http/axios`
  client, real `typescript/http/express` server, real `/exact/stellar`
  payment, verdict `✅ Test passed`. A same-day follow-up ran it again with
  `--extensions=bazaar`, forwarding the facilitator's own
  `/discovery/resources`/`/discovery/search` routes to the live deployment
  too: the suite's own Discovery Validation step, which calls those routes
  directly against the facilitator, confirmed the just-paid resource was
  cataloged and discoverable, verdict `✅ Discovery Validation: PASSED`,
  the strongest evidence of the two, since it's the exact capability this
  RFP funds. Both settled transaction hashes are independently checked
  against Horizon, same standard as every other hash in this README. A
  real gap found in the suite's own client bootstrapping along the way is
  filed as
  [x402-foundation/x402#3187](https://github.com/x402-foundation/x402/issues/3187).
  **Own PR, merged 2026-08-31 by @phdargen (`dd258756...`):**
  [x402-foundation/x402#3228](https://github.com/x402-foundation/x402/pull/3228)
  scopes EVM/SVM client signer derivation to the selected `--families`,
  the same pattern every other family already followed, plus a second
  gap found the same way: the harness's own preflight check validated
  facilitator env vars but never client env vars, so a family-scoped run
  could pass that check and still crash deep inside a client. Rebuilt
  and re-verified against current upstream `main` before opening the
  PR, not just the original fix: the full `typescript/` and `e2e/`
  workspaces built clean, and calling the real `createE2EClient()`/
  `runClientScenario()` under five scenarios (no client creds, matching
  the exact reported crash; EVM-only; SVM-only with a real generated
  Ed25519 keypair; both; and the batch-settlement-without-EVM-creds
  guard) all passed. Fixing this benefits our own conformance
  infrastructure directly, not charity toward an unrelated repo: it's
  the same suite this README's own settled transactions above ran
  through. Full transcript and setup for both e2e runs in
  [`docs/conformance/2026-08-17-x402-e2e-stellar-exact.md`](docs/conformance/2026-08-17-x402-e2e-stellar-exact.md).
  Independently reinforced before it merged: an unrelated Stellar
  facilitator, stellarsight, hit the identical `#3187` crash in their
  own conformance run and needed the same decoy-key workaround, cited
  directly on this PR with their commit hash, full writeup in
  `docs/DEFERRED.md`.

  Reviewing `@x402/core`, the package this facilitator is built directly
  on, as part of a wider pass over the dependency (not triggered by
  anything breaking in our own deployment, which only ever registers a
  single Stellar namespace), we found a real bug in
  `x402Facilitator.derivePattern()`: registering a facilitator against
  networks from more than one CAIP-2 namespace in a single call silently
  drops wildcard matching in every namespace involved, not just the
  second. Verified empirically against the published
  `@x402/core@2.21.0`, with a working reproduction contrasting
  mixed-namespace registration (fails) against single-namespace
  registration (works as intended). Filed as
  [x402-foundation/x402#3172](https://github.com/x402-foundation/x402/issues/3172).
  **Status: fixed, not just filed.** We proposed the fix ourselves rather
  than waiting on a maintainer:
  [x402-foundation/x402#3215](https://github.com/x402-foundation/x402/pull/3215),
  open and mergeable, 657 tests passing. `derivePattern()` now derives one
  wildcard pattern per namespace present in a registration, instead of
  collapsing the whole call to a single literal pattern from the first
  network. Our first regression test was itself wrong: it assumed a
  namespace with only one registered network should get wildcard coverage
  after the fix, which contradicts `derivePattern()`'s own pre-existing
  single-network rule, unrelated to this bug and correct as-is. We caught
  it because the test failed against our own correct fix, corrected the
  test to use multi-network namespaces, and posted the correction publicly
  on [the original issue](https://github.com/x402-foundation/x402/issues/3172#issuecomment-5358382027)
  rather than letting a flawed original repro stand uncorrected. A separate,
  unrelated defect surfaced 2026-08-23: the PR's `check-verified-commits`
  check was failing because its one commit was unsigned. Fixed by amending
  it with a registered SSH signing key and force-pushing the same branch;
  GitHub's API confirms `verified: true` on the amended commit and the
  check now passes. Still open, awaiting maintainer review.

  **2026-09-01: a deliberate, proactive pass over the latest published
  `@x402/core@2.24.0`, `@x402/stellar@2.24.0`, and
  `@stellar/stellar-sdk@17.0.1`**, searched rather than waited for, on the
  same "reimplementing a check found a gap the type promised" pattern as
  `derivePattern()` above. `ExactStellarScheme`'s `feeBumpSigner` is
  documented by `getSigners()` as a facilitator address, but the internal
  set every facilitator-safety check actually consulted
  (`signingAddresses`) never included it, filed as
  [x402-foundation/x402#3332](https://github.com/x402-foundation/x402/issues/3332).
  **Status: fixed, not just filed.**
  [x402-foundation/x402#3336](https://github.com/x402-foundation/x402/pull/3336)
  adds a separate `facilitatorSafetyAddresses` set rather than merging into
  `signingAddresses` directly, since that set also backs signer selection
  in `settle()` and `feeBumpSigner` has no entry in the signer map, a
  distinction that would have been an easy regression to introduce
  carelessly. `resolveSettlementOverrideAmount()` never enforced its own
  documented invariant, "the resolved amount must be `<=` the authorized
  maximum in `PaymentRequirements`," for any of its three input formats
  (raw atomic units, percent, dollar), filed as
  [x402-foundation/x402#3334](https://github.com/x402-foundation/x402/issues/3334).
  **Status: fixed, not just filed.**
  [x402-foundation/x402#3338](https://github.com/x402-foundation/x402/pull/3338)
  centralizes one check at the end of the function rather than duplicating
  it per branch, verified with a real repro against the installed package
  before writing the fix (a `"500%"` override against a 1,000,000-unit
  ceiling resolved to 5,000,000 with no error) and the full `@x402/core`
  suite green before and after (691 to 695 tests). `areFeesSponsored:
  false` is accepted with no validation at construction time, then breaks
  every settlement through the official client elsewhere with no
  indication the facilitator's own config is the cause, filed as
  [x402-foundation/x402#3333](https://github.com/x402-foundation/x402/issues/3333).
  The behavior fix we first drafted (throw at construction) turned out to
  be wrong: an existing test,
  `"should use custom areFeesSponsored"`, deliberately asserts that
  constructing with `false` succeeds. So
  [x402-foundation/x402#3339](https://github.com/x402-foundation/x402/pull/3339)
  lands as a doc-only PR instead, cross-referencing the limitation on the
  constructor's own JSDoc where `getExtra()` already states it two methods
  away.

  **One finding didn't survive its own fix, and that's the correct
  outcome, not a failure.**
  [stellar/js-stellar-sdk#1699](https://github.com/stellar/js-stellar-sdk/issues/1699)
  reported that `XdrLargeInt.toU128()`/`.toU256()`/`.toU64()` silently
  wrap a negative value instead of throwing `RangeError`, based on reading
  `XdrLargeInt`'s own unit tests in isolation. Writing the actual fix and
  running the package's full test suite, not just the touched file, the
  same discipline `#3172`'s self-correction above already established,
  surfaced `test/unit/base/numbers/sc_int.test.ts`, a block explicitly
  labeled "from scint_test.js" (a shared, cross-SDK test-vector file).
  It deliberately constructs a negative `ScInt` and asserts
  `.toU128()`/`.toU256()` return exactly the two's-complement
  reinterpretation reported as a bug: intentional, cross-SDK-consistent
  design, not an oversight. The patch was reverted before ever being
  pushed; the issue was corrected with the full evidence and closed by
  the same session that filed it. Full writeup, including a stray fork
  found 89 commits behind upstream mid-round and fixed before it could
  affect anything, in `docs/DEFERRED.md`.
- **Automatic cataloging** lives in `apps/facilitator/src/discovery.ts`.
  A payment carrying the `bazaar` discovery extension is validated and
  written to the catalog on `/settle`. There is no separate registration
  step, no dashboard, and no API key.

  **2026-08-25: settle-only, corrected from an earlier verify-or-settle
  reading.** Cataloging used to run on `/verify` too, whenever
  `isValid: true`. That reading is conforming with the extension spec's
  own text, but `isValid: true` only proves a payload could settle, not
  that it did: no funds move on verify, so a catalog entry, and every
  `accepts` option in it, could be produced for one HTTP request and no
  balance. This is exactly what
  [x402-foundation/x402#3226](https://github.com/x402-foundation/x402/issues/3226)
  audited in public, with a reproduced example of it happening against
  a live facilitator. Our own ranking has no
  popularity or call-count column to inflate, but the catalog's
  contents, resources and payment options that were never actually paid
  for, could still be minted the same way. Fixed by removing the
  `/verify`-side write entirely; `/settle`'s `result.success` (a real
  settled transfer, confirmed the same way every transaction in this
  README is confirmed) is now the only trigger.
  [pedro-pelicioni](https://github.com/pedro-pelicioni) (stellarsight,
  a second real Stellar Bazaar facilitator, credited elsewhere in this
  README and in `docs/UPTO-CONVERGENCE.md`) independently reached the
  same settle-only reading and confirmed it in the same GitHub thread,
  code checked directly rather than taken on the comment alone. Full
  writeup in `docs/DEFERRED.md`. `pnpm run ci` green throughout, 255
  tests.

  **2026-08-27: this stopped being something we only observed.** Added
  our own data point to `#3226` directly, citing
  [`fae6daa9`](https://github.com/Eras256/Periplo/commit/fae6daa90885e99d81056c1178d2e13ab81d3980)
  (the commit above), a third implementation reaching settle-only
  without coordinating with the other two.
  [whawk46](https://github.com/x402-foundation/x402/issues/3226#issuecomment-5438145198)
  named it explicitly as part of the consensus: "With Periplo,
  @pedro-pelicioni, and our datasets aligned, we have the consensus
  needed to make settle-only catalog provenance a normative requirement
  in the specification." The issue itself has since been retitled from
  an open question to a formal proposal: "Label catalog provenance,
  verify-only versus settled, so Bazaar counters mean something." Same
  pattern as the rest of this section: not just building on what this
  project proposed, now citing this project's own evidence to write the
  norm.

  **2026-08-26: `extensions.bazaar` was echoed empty for every
  resource, found reconciling a real integrator's conformance report
  against the live deployment instead of assuming either side was
  right.** Two of the report's three claimed gaps didn't match the raw
  402 challenge (`description` and the bazaar declaration were both
  fully populated there), but did match `GET /discovery/resources` and
  `GET /discovery/search`, which both echoed `extensions.bazaar: {}`
  regardless. Root cause: the catalog tracked which extension keys a
  resource declared, never their actual payload, contradicting
  `@x402/extensions/bazaar`'s own `DiscoveryResource` type, which
  documents that field as "Extension payloads echoed from discovery."
  Fixed with a new `extension_payloads` column, deployed, and verified
  against the live catalog with a real re-settled payment
  ([`12470945ac72...`](https://stellar.expert/explorer/testnet/tx/12470945ac72aed3b781f102848f2346c85e3c85d874fb2a3ff6cf17df6cd375),
  Horizon-verified): `GET /discovery/search` now returns the full
  declared `info`/`schema` object. Separately deleted a stale Phase 4
  test fixture (`financial_analysis_da8703fa-...`, literal placeholder
  `asset`/`payTo` values, surfacing in every search result regardless
  of relevance) that the same reconciliation turned up. The report's
  CORS-header claim, initially left unresolved, turned out to measure a
  different, unrelated deployment entirely (confirmed by the report's
  own author and independently corroborated), never Periplo.

  **The first real external seller published and settled for real the
  same round** (`agentpayments.fi`), and found a genuine, money-relevant
  bug doing it: `EXTENSION-RESPONSES` never reached their code from
  `/settle`, even though cataloging worked. Root cause verified before
  fixing, not assumed: a direct fetch to `/settle` showed the header is
  sent correctly on the wire, so the gap traced to the installed
  `@x402/core@2.22.0` dependency itself, whose `HTTPFacilitatorClient.
  settle()`/`.verify()` read the header only to `console.log` it
  internally, then discard it, never attaching it to what those methods
  return to the caller, confirmed reading the actual compiled source.
  Filed as
  [x402-foundation/x402#3270](https://github.com/x402-foundation/x402/issues/3270),
  with a proposed fix (populate the `extensions` field those response
  types already declare but never use). **Status: fixed on our own
  side the same day, not waiting on the upstream merge.** `/settle`'s
  JSON body now also carries the outcome in that same
  already-declared-but-previously-empty `extensions` field, verified
  through the real official client, not just a raw fetch: transaction
  [`10919a59342fc0cc...`](https://stellar.expert/explorer/testnet/tx/10919a59342fc0cc69d3698a58cf7fb76f3e997914e16562ffa39bbf7f70af28),
  Horizon-verified. **A community member (`Bartok9`) built the upstream
  fix**: [`#3278`](https://github.com/x402-foundation/x402/pull/3278),
  open, not yet merged. Reviewed the real diff line by line before
  saying so, not on the strength of the PR description: it matches the
  body-wins/header-fallback precedence proposed in `#3270` exactly, and
  ships four regression tests, not the three the PR's own summary
  implies (the fourth, a malformed-header case, wasn't something we'd
  asked for, a good defensive addition on its own initiative). **Went
  further than reading the diff**: pulled `#3278`'s own branch
  (`bartok9/extension-responses-header-3270`, `54b136d`), built its
  `@x402/core` directly, and ran a real payment through it against our
  own production facilitator, `https://periplo-testnet.fly.dev`, the
  exact deployment the original bug came from. `verify()`/`settle()`
  both real, `settleResult.extensions` populated, transaction
  [`892af0974bee...`](https://stellar.expert/explorer/testnet/tx/892af0974bee7884e491dbe8d39a7450113bdfb90ae814f80dcefb3b3f774e85),
  Horizon-verified. Honest about scope: this exercised the body-wins
  branch, the only one reachable against a facilitator that already
  sends `extensions` in the body on our own side, not the header-only
  fallback, which stays covered only by Bartok9's own mocked tests. A
  separate, unrelated version-skew finding from the same run
  (a client-side `spendControls` guard newer than what we pin) is
  tracked in `docs/DEFERRED.md`, not repeated here.

  **Update, 2026-08-30: the same finding rippled across three separate
  SDK implementations.** wnjoon, who triaged `#3270` in the thread,
  independently confirmed the identical gap in the Go client
  (`go/http/facilitator_client.go`'s `verifyHTTP`/`settleHTTP` discard
  the decoded header the same way the TypeScript client does) and
  opened [`#3301`](https://github.com/x402-foundation/x402/pull/3301)
  themselves, explicitly refing this issue and `#3278` as its Go parity
  follow-up, deliberately keeping `#3270` open rather than closing it
  against a single-language fix. A Python draft addressing the same gap
  in `python/x402/http/facilitator_client.py`'s
  `HTTPFacilitatorClient`/`HTTPFacilitatorClientSync` is open as
  [`PhilBot402/x402#4`](https://github.com/PhilBot402/x402/pull/4) (a
  fork PR, still a draft, not yet opened against the upstream repo
  itself), also linking back to `#3270` directly. Three independent
  SDK-language fixes now trace to the one issue this project opened:
  TypeScript (`#3278`, Bartok9), Go (`#3301`, wnjoon), Python
  (`PhilBot402/x402#4`, draft). All three open, none merged as of this
  writing, verified live before writing this.

  **Resolved upstream, 2026-08-31, not by the three PRs above
  directly.** `#3270` closed the same day (`stateReason: COMPLETED`),
  but the fix that actually closed it was a maintainer's own separate
  PR,
  [`#3306`](https://github.com/x402-foundation/x402/pull/3306) (Python,
  phdargen), merged 2026-08-31T15:59:00Z, two seconds before the issue
  closed. Its own description rejects the shape `#3278`/`#3301`
  originally shipped, merging the header data into the existing
  `extensions` field, calling that "the wrong shape" since it leaks a
  server-only sidechannel into a field the resource server forwards to
  buyers via `PAYMENT-RESPONSE`. It introduces a separate
  `extension_responses` field instead, excluded from that buyer-facing
  encoding. `#3278` was revised to match before merging, confirmed
  against its real merged diff: it now populates `extensionResponses`,
  explicitly "Never merges into `extensions`," and merged separately,
  2026-08-31T17:34:56Z, after the issue had already closed. `#3301`
  (Go) and the Python draft remain open, unmerged, presumably needing
  the same realignment. No `@x402/core` release ships this shape yet
  (npm `latest` is still `2.24.0`, from 2026-08-27), not a precondition
  either way: `/settle` now sends `extensionResponses` alongside the
  existing `extensions` field (neither replaces the other), the same
  way it already sent `extensions` ahead of any client reading it.
  Verified against the real merged `httpFacilitatorClient.ts` on `main`
  before writing this, not assumed: the official `HTTPFacilitatorClient`
  doesn't actually read `extensionResponses` from the body at all,
  `settleResponseSchema` doesn't declare it, so it gets populated purely
  from the `EXTENSION-RESPONSES` header this facilitator already sends
  correctly, no body change needed for that client specifically. The
  body field is for any other caller reading the JSON directly.

  **Protocol 28 ("Adapter") readiness, checked for real against testnet
  ahead of the 2026-09-16 mainnet vote, not just a version bump.**
  Commit [`32f5d56`](https://github.com/Eras256/Periplo/commit/32f5d56):
  `@stellar/stellar-sdk` upgraded `16.2.0` → `16.3.0`, the LTS release
  backporting full Protocol 28 XDR support (CAP-85's new
  `ContractExecutable` variant, CAP-83) onto the stable v16 API, not
  `17.0.1` (npm `latest`), because `@x402/stellar`, this project's own
  dependency, still hard-pins `^16.0.1`; a v17 bump would have split the
  install into two incompatible major versions of the same package. The
  same commit settled three real transactions on `stellar:testnet`
  under the new protocol, each Horizon-verified: `exact`
  ([`e102cf87...`](https://stellar.expert/explorer/testnet/tx/e102cf87e49228935ac77edc3584a9926c3c0769bb2a5fbe32b3b19831328b42)),
  `upto`'s `contract` profile direct against the deployed contract
  ([`265d5c4e...`](https://stellar.expert/explorer/testnet/tx/265d5c4e49a201fac9113ecdf91e4767fcd5e800c58ab6dfc38c2a350d701469)),
  and `upto`'s `contract` profile through this facilitator's own
  HTTP-route code
  ([`383b8319...`](https://stellar.expert/explorer/testnet/tx/383b8319b04d58481fd94f2a2810b6f498d365d714c5a2db5bc226936b286799)).
  The run wasn't cosmetic: the same commit fixes a real bug it found,
  `apps/facilitator/scripts/settle-demo.ts` had never read
  `MAX_TRANSACTION_FEE_STROOPS` the way the deployed `serve.ts` does,
  so it failed on the real, current testnet fee (`95,461` stroops that
  day, already above the `72,000` that first required the override in
  August). Also left [a corroborating
  comment](https://github.com/OpenZeppelin/stellar-contracts/issues/865#issuecomment-5515054181)
  on `OpenZeppelin/stellar-contracts#865`, filed independently the same
  day by a different project on the same GitHub account with a
  stronger repro (a real `error[E0004]` compiling against
  `soroban-sdk 28.0.0-rc.1`): the same `ContractExecutable` match gap,
  hit at a different `soroban-sdk` pin (`26.1.1`), a second,
  independent confirmation of the same root cause. Full detail in
  `CLAUDE.md`.

  It is built on the official
  [`@x402/extensions/bazaar`](https://github.com/x402-foundation/x402/tree/main/typescript/packages/extensions/src/bazaar)
  package, for the same reason the facilitator does not reimplement
  verify and settle. We kept `packages/bazaar`'s own stricter
  `routeTemplate` check in place of the upstream equivalent;
  [`docs/INTEROP.md`](docs/INTEROP.md) explains where and why. That work
  also surfaced a real bug in the upstream package itself, affecting
  `mcp://tool/{toolName}` URLs, the exact convention the Bazaar extension
  documents for MCP tools. We found it through the live integration
  test, not by reading the code, and filed it as
  [x402-foundation/x402#3121](https://github.com/x402-foundation/x402/issues/3121).
  A fix is open against it as
  [x402-foundation/x402#3138](https://github.com/x402-foundation/x402/pull/3138),
  built scheme-agnostic per a reviewer's suggested shape rather than an
  `mcp://`-specific patch. That same reviewer, whawk46, later found a
  real follow-on gap in the fix itself (the opaque-origin branch skipped
  the query/fragment stripping the function exists to do), we
  implemented the fix they suggested for it with a new regression test,
  and they reviewed that too, quoted verbatim: "LGTM as it stands —
  merge-ready from my side." Nine days later, still unmerged, whawk46
  seconded their own review with a merge request, explicit about why the
  fix is a real defect rather than a cosmetic one, quoted verbatim: "a
  query string surviving into the canonical URL means the same resource
  indexes under as many identities as it has session parameters, which
  is the kind of thing that quietly inflates a catalog and is very hard
  to attribute afterward." The PR is open, mergeable, commented on three
  times by the person who reported the original bug, with a separate
  merge nudge from us the same week. **Precision check, 2026-08-23:**
  GitHub's own review API reports zero formal reviews on this PR
  (`reviews: []`); whawk46's "LGTM"/"nothing further" language is plain
  comment text, not a submitted GitHub review, and we have not confirmed
  whawk46 holds a maintainer or write-access role on this repo. Stated
  here as what it is: a positive, substantive comment from the person who
  reported the original bug, not a formal or authoritative approval.
  Still open, blocked on a maintainer actually merging it.

  Reviewing the same `@x402/extensions/bazaar` package a second time
  turned up another real bug, this one in `isValidRouteTemplate`
  itself: its traversal and scheme-injection checks decode
  `routeTemplate` once, so a double percent-encoded payload survives
  the first decode still encoded and slips past both checks, verified
  directly against the function with two working repro payloads. Filed
  as [x402-foundation/x402#3169](https://github.com/x402-foundation/x402/issues/3169).
  **Status: no longer just filed and waiting, another contributor's fix
  is now independently verified with real code, not just read over.**
  [ygd58's PR](https://github.com/x402-foundation/x402/pull/3213)
  decodes to a fixed point with a bounded pass budget instead of one
  extra fixed pass. We re-ran both original repro payloads directly
  against the actual diff, both correctly rejected, then went further
  than the original report asked for: triple-encoded payloads, and the
  decode-budget boundary checked from both sides (a payload needing
  exactly 4 passes still resolves and rejects; one needing 6 exceeds the
  5-pass budget and rejects safely rather than hanging or passing
  through partially decoded). Recorded as
  [a real review comment](https://github.com/x402-foundation/x402/pull/3213#issuecomment-5357836987),
  not a thumbs-up.

  A separate one surfaced while working the OpenZeppelin smart-account
  issue below (`#839`): `@stellar/stellar-sdk`'s
  `AssembledTransaction.needsNonInvokerSigningBy()` and
  `signAuthEntries()` only ever look at the top-level node of a
  `SOROBAN_CREDENTIALS_ADDRESS_WITH_DELEGATES` (CAP-71) auth entry, so
  a delegate signature that's still outstanding is never reported,
  verified with two real entries built via the SDK's own
  `buildWithDelegatesEntry`/`authorizeEntry`. CAP-71 isn't live on any
  network yet, so this has no impact today, but the bug is real in
  code already shipped. Filed as
  [stellar/js-stellar-sdk#1655](https://github.com/stellar/js-stellar-sdk/issues/1655).
  **Status: fixed, not just filed.**
  [stellar/js-stellar-sdk#1672](https://github.com/stellar/js-stellar-sdk/pull/1672),
  open and mergeable, 6663 tests passing. `needsNonInvokerSigningBy()` and
  `signAuthEntries()` now walk the full delegate tree instead of the
  top-level node only. On 2026-08-23 the maintainer, roebee, asked directly
  on #1655 whether this behavior change (a documented public API now
  reports every unsigned node, not just the top-level one) should ship as
  a v17.x bug fix or wait for v18, given CAP-71 isn't live on any network
  yet. We replied recommending v17.x. Rebased onto `v17.0.1` on
  2026-08-28 once upstream cut that release mid-PR-lifetime, settling
  the question by circumstance rather than a maintainer decision: the PR
  can now only ship as a later v17.x patch, not v18. Running the new tests
  surfaced a second,
  genuinely separate bug along the way, not the one we set out to fix:
  `authorizeEntry()`'s bare-signature fallback path infers `publicKey`
  from the entry's top-level address unconditionally, ignoring
  `forAddress`, so a signature correctly targeted at a delegate was
  verified against the wrong address and failed. Worked around narrowly,
  inside `signAuthEntries()`'s own callback, without touching
  `authorizeEntry()` itself, since that's out of scope for this PR, and
  never given its own issue at the time. Opened now, on its own, closing
  that gap: [stellar/js-stellar-sdk#1683](https://github.com/stellar/js-stellar-sdk/issues/1683),
  with the exact code path quoted, `applyExpirationAndSignature`'s own
  correct fallback rule cited as the pattern the verification step
  should mirror, and a proposed fix. On 2026-08-23 roebee posted three
  implementation questions to pin the fix down: how to derive the public
  key when the signer callback returns a bare `Uint8Array` instead of
  `forAddress`, what the resulting error text should say, and whether the
  verify step should follow `applyExpirationAndSignature`'s own fallback
  rule. We replied the same day: throw rather than silently derive from
  `forAddress`, proposed error wording, and yes to matching the existing
  fallback rule, with this fix landing in the same PR as #1681's below
  since both converge on the same `{ signature, publicKey }` return shape.
  **Status: filed; the proposed fix (verify against `forAddress` on the
  naked-signature path in `base/auth.ts`, exactly the one line proposed
  in the issue) landed in code as part of #1672 on 2026-09-01, prompted
  by a second maintainer's review, Ryang-21, see below — not yet
  confirmed by roebee, and the issue itself stays open on GitHub until
  #1672 actually merges, not claimed closed early.**

  That same `authorizeEntry()` bare-signature fallback path turned up a
  second, separate way to trip it: attempting a genuine classic Stellar
  multisig payment (a second Ed25519 key registered on the buyer's
  account, weight 1, signing instead of the master key, not simulated,
  verified on a real testnet transaction that registers the signer)
  found `AssembledTransaction.signAuthEntries()` can't represent a
  non-master-key signer at all, for two separate reasons. First,
  `signAuthEntries()`'s own `address` default calls `signerAddress()` on
  `signAuthEntry` itself, a plain function per that option's own
  documented type (`SignAuthEntryLike = SignAuthEntry | Signer |
  Keypair`); `signerAddress()`'s guard requires an object, so it can
  never resolve for the simplest, most common, fully-documented usage,
  and silently falls back to an unrelated address instead. Second, even
  when a caller supplies `address` explicitly and sidesteps that (as
  `@x402/stellar`'s own client does), the per-entry signing closure
  discards any `signerAddress` a custom signer returns before handing a
  bare signature to `authorizeEntry()`, landing on the exact fallback
  path above and verifying against the wrong key again, this time for a
  plain `Address` credential rather than a CAP-71 delegate. Filed as
  [stellar/js-stellar-sdk#1681](https://github.com/stellar/js-stellar-sdk/issues/1681),
  with a proposed fix for both, checked against #1610 first to confirm
  it wasn't a duplicate. On 2026-08-23 roebee asked two questions to pin
  the fix: whether the missing-`address` default should throw or keep the
  current silent fallback to `this.options.publicKey`, and whether the
  signing closure should return `{ signature, publicKey }` (and if so,
  whether that lands together with #1683 or as separate PRs). We replied
  the same day: throw rather than fail silently, return
  `{ signature, publicKey }`, and land both fixes in one PR since they
  converge on the same return shape. **Status: filed, our proposed
  direction posted in reply to the maintainer's questions, not yet
  confirmed by roebee, not fixed, open.**

  On 2026-08-24, GitHub Copilot's automated review on #1672 itself
  surfaced two more real, independently-verified problems, not just
  style nits. First, the regression-test comment for the #1655 case
  1/2 tests claimed both were "built the same way
  (buildWithDelegatesEntry / authorizeEntry, not hand-constructed
  XDR)". Checked against the actual test code, that's false: both
  hand-construct `SorobanAddressCredentialsWithDelegates` XDR directly,
  with placeholder `scvBytes`/`scvVoid` signatures, same pattern as the
  file's own `addrCreds`/`authEntry` helpers. Fixed the comment to
  describe what the test actually does. Second, and more substantive:
  `signAuthEntries()`'s own default callback returned
  `{ signature, publicKey: target }` unconditionally, where `target` is
  only who the SDK asked to sign, discarding a `signerAddress` the
  signing callback may report when the real signer differs, such as a
  delegate whose real key differs from the delegate node's own address.
  Reverting the fix reproduces a real `signature doesn't match payload`
  failure from `authorizeEntry`; a new regression test signs with a
  different keypair than the one requested and confirms the default
  path still verifies. Both fixed and pushed to the same branch:
  `pnpm exec vitest run test/unit`, 130 files, 6664 tests passing.

  A second Copilot review, 2026-08-29, after the `v17.0.1` rebase, found
  a real regression we introduced ourselves: resolving the `CHANGELOG.md`
  conflict during the rebase had deleted the entire `v17.0.0` release
  section, jumping straight from `v17.0.1` to `v17.0.0-rc.2`. Restored
  verbatim from upstream `main`, verified byte-for-byte identical to the
  real released section, fixed and pushed the same day. Three further
  comments from that review are still open, unresolved design questions
  on `assembled_transaction.ts` rather than regressions: whether
  `needsNonInvokerSigningBy()` should exclude a delegate an account's own
  policy may never require, whether its public documentation should
  describe contract-address delegates (not just accounts), and whether
  `signAuthEntries()` should preserve an entry's existing expiration once
  any node is signed rather than overwrite it with a fresh one on a later
  signer. **Status: rebased, mergeable, three real review findings from
  Copilot pending a fix, not a version question anymore.**

  On 2026-09-01, a second real maintainer, Ryang-21, distinct from
  roebee's ongoing engagement above, left a formal review on #1672
  itself: `CHANGES_REQUESTED`, five inline comments, each naming a
  genuine silent-signature-corruption or dead-end path, not a style nit.
  In order: reusing a fresh `expiration` default across sequential
  multi-party signers silently invalidates an earlier signer's signature
  (`Error(Auth, InvalidAction)` on the real host, no client-side warning
  first) — the same defect Copilot's own third open question above had
  already flagged, now confirmed and fixed by a second, independent
  reviewer; a missing `!signer.signed` guard let a repeat
  `signAuthEntries()` call for an already-signed address re-sign and
  re-bump the same shared expiration through a second door; a
  contract-address (`C...`) delegate target reached an unreachable
  `signatureScVal` branch, surfacing only an opaque strkey error; a
  pre-#1672 custom `authorizeEntry` with 4 declared parameters silently
  dropped the new `forAddress` (5th) argument, writing a delegate's
  signature to the entry's top level instead of the delegate node; and
  the #1683 fix belonged in `base/auth.ts` itself, not the narrower
  `assembled_transaction.ts` workaround this PR had shipped with. All
  five fixed in one commit, `0dd1c624`, each with its own new regression
  test (the expiration-reuse test needed a rewrite mid-session from a
  passthrough mock, which never actually exercised the check, to real
  signing via `contract.basicNodeSigner`, caught before pushing). Replied
  inline to each of the five threads plus one summary comment, each
  referencing the real commit rather than asserting the fix happened.
  Merged `upstream/main` afterward (`81466fd9`, a merge commit, not a
  rebase, so Ryang-21's existing comment anchors didn't move) to pick up
  #1693/#1698, one `CHANGELOG.md` conflict resolved by hand. Re-verified
  in full post-merge: 132 test files, 6743 tests passing, both `tsc -p`
  invocations clean, `eslint src/` clean, generated docs confirmed
  current by the repo's own pre-push hook. Signed and verified:
  `gh api repos/Eras256/js-stellar-sdk/commits/81466fd9 --jq
  '.commit.verification.verified'` returns `true`. CI (Tests, CodeQL,
  Docs build, Code Formatting, Guide snippets, e2e) shows
  `action_required`, confirmed via the Actions API rather than assumed
  from the check list alone: the standard GitHub gate for an external PR
  awaiting a maintainer's manual approval to run workflows, not a failure
  on this branch. **Status: all five of Ryang-21's review points fixed
  with dedicated tests and evidence, merge conflict resolved and pushed,
  signed, nothing further actionable from this side until a maintainer
  approves CI and review resumes. Copilot's first two open design
  questions above (excluding a never-required delegate, documenting
  contract-address delegates) remain genuinely open, distinct from what
  Ryang-21's review covered.**

  Resuming the broader search this session had paused for the Ryang-21
  review, the same defect class recurred independently, the same day, in
  a different official SDK: `StellarCN/py-stellar-base`'s own
  `authorize_entry()` (`stellar_sdk/auth.py`) signs each CAP-71-01
  delegate correctly in isolation, but sequential signing across
  multiple delegates silently overwrites the entry's one shared
  `signature_expiration_ledger` field, invalidating an earlier
  delegate's already-stored signature whenever two calls use different
  expiration values, with no error raised at either call. The library's
  own docstrings already state the requirement in prose, twice ("every
  signer of one entry must use the same `valid_until_ledger_sequence`,
  otherwise earlier signatures are invalidated"), but nothing in code
  enforces it, and `AssembledTransaction.authorize()`/`sign_auth_entries()`
  never reach this path at all: they only target the top-level address
  by design, so `authorize_entry(..., for_address=...)` is the *only*
  documented way to sign a delegates entry with this library, not a
  fallback. Reproduced for real against `a0e9f8b7` (the commit last
  touching `auth.py`): two delegates signed with expirations 1000 and
  2000, then the payload the network would actually verify the first
  delegate's stored signature against (rebuilt from the entry's current
  state, expiration 2000) compared byte-for-byte against the payload it
  was actually signed with (expiration 1000) — confirmed different.
  Checked for duplicates first (none found; the PR that added this
  support, `#1189`, has no discussion of this case in its own review).
  Filed as
  [StellarCN/py-stellar-base#1215](https://github.com/StellarCN/py-stellar-base/issues/1215)
  with a proposed fix (raise a clear `ValueError` in `authorize_entry()`
  when an already-partially-signed entry's stored expiration disagrees
  with the one just passed, instead of silently overwriting it), not
  just the finding. Severity calibrated the same honest way as #1655's
  own entry above: CAP-71 isn't live on any network yet, so this has no
  impact on a real transaction today, but the bug is real in code
  already shipped, in the only path this library offers for it. No PR
  opened yet, per this repo's own `CONTRIBUTING.md`, which asks
  contributors to check in before starting work on a significant
  change; the issue includes a full fix sketch so that step is fast once
  a maintainer responds.

  Both #1672 and #3215 are the first pair of contributions from this
  project to go through the checklist in
  [`.claude/skills/claude-antigravity-setup/git.md`](.claude/skills/claude-antigravity-setup/git.md)
  in full: humanized, no filler, a visible AI co-authorship trailer on
  every commit, and root cause confirmed with real, run code before
  proposing the fix, not just reasoned about.

  Investigating the discovery mechanism behind the `stellar-build` skill
  pack this project's own tooling uses (see `docs/SKILLS.md`) turned up a
  bug in a different, adjacent repository: `stellar/stellar-dev-skill`,
  the site behind the pack's public skill index. 27 of 28 community-skill
  entries in its `llms.txt` (an agent-fetchable index, per the llmstxt.org
  convention) linked to GitHub's rendered HTML page instead of the raw
  markdown, verified live against the deployed `skills.stellar.org/llms.txt`,
  not just the source. Root-caused to the repo's own contribution guide:
  its own example for adding a new entry used the wrong URL shape directly
  beneath the prose describing the correct one, which likely explains why
  27 of 28 contributors made the same mistake independently. Fixed with a
  PR rather than just an issue: all 27 URLs, the contribution guide's
  example, and a new CI check preventing the mistake from recurring. Filed
  as [stellar/stellar-dev-skill#103](https://github.com/stellar/stellar-dev-skill/pull/103),
  merged 2026-08-28 by @kaankacar.

  On 2026-08-24, Copilot's review on #103 flagged that the new CI
  gate's own regex, `BLOB_PATTERN =
  /^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\//`, only matched the
  canonical `https://github.com/...` form, missing `http://github.com/...`
  and `www.github.com/...`, both of which serve the same HTML blob page
  the check exists to catch. Verified against the actual regex, confirmed
  real. Fixed by parsing with `URL` and comparing hostname
  (case-insensitive, `www.` stripped) and pathname instead of a
  fixed-scheme regex. Added `scripts/check-ecosystem-links.test.mjs`
  (Node's built-in test runner, no new dependency) covering the
  canonical form and the three variants that slipped through before,
  wired into both CI workflows as a new `pnpm test:ecosystem-links`
  step. `node --test`: 7 passed; the real gate still passes against the
  live 28-entry `ECOSYSTEM_CARDS` list. Both fixed and pushed to the
  same branch.

  On 2026-08-27, Kaan Kaçar's own automated triage bot reviewed #103
  directly and confirmed the original fix real (`generate-llms-txt.mjs:156`
  writes `copyValue` verbatim into `llms.txt`, the deployed file held 28
  blob links and 0 raw ones, all 27 rewritten URLs returned
  `200 text/plain`), then raised three further findings, each verified
  independently before fixing rather than accepted on the bot's word
  alone. First, `main` had gained a new ecosystem card (PMLL) since the
  branch was cut, still pointing at a `blob` URL; it merged cleanly (no
  conflict) but left one `blob` `copyValue` in the tree, which would have
  failed `check:ecosystem-links` on the first deploy after merge. Fixed
  by rebasing onto `origin/main` and rewriting that entry, its raw URL
  confirmed `200` before writing it. Second, the wrong-URL-shape example
  from the original fix was only corrected in `site/README.md`;
  `site/src/app/page.tsx`'s `ADD_SKILL_SNIPPET` (the copy actually
  rendered live in the site's "Add your skill" block) and
  `site/CLAUDE.md`'s own contribution guide still carried it, both fixed
  to match. Third, rewriting every `copyValue` to
  `raw.githubusercontent.com` had silently changed each community card's
  "View source" icon to open plain text instead of GitHub's rendered
  page, since `page.tsx` passed `sourceUrl={c.copyValue}`, the same value
  for both. Decided on purpose rather than left as a side effect: a new
  `ecosystemSourceUrl` helper (`site/src/lib/ecosystem-source-url.mjs`)
  reconstructs the `github.com/.../blob/...` URL from the raw one instead
  of storing a second field that could drift, falling back to the
  original URL unchanged for a card not hosted on GitHub at all
  (`stellarlight.xyz`), verified against the real build output for both
  cases plus the newly-fixed PMLL entry. A smaller fix rode along:
  `import.meta.url` compared against a hand-built `file://` string
  doesn't survive a checkout path needing URL-encoding, silently skipping
  the whole check; `import.meta.filename` compares raw paths directly
  instead. Left open for @kaankacar, not decided unilaterally: whether
  `check:ecosystem-links` should run in the PR lane at all, since
  `preview-pr.yml` skips fork PRs today. Fixed and pushed as `8eb4c4d`:
  `pnpm lint`, `lint:ts`, and `build` clean, the real gate reporting 29
  entries and no blob URLs, `node --test` 12/12 across both
  ecosystem-links test files.

  On 2026-08-28, the same bot's third triage round on `8eb4c4d` raised
  three more real, independently confirmed findings before this could go
  to @kaankacar for a human merge decision. First,
  `check:ecosystem-links`/`test:ecosystem-links` had never actually run
  in CI for this PR at all: `site-ci-fork.yml`, the only pre-merge lane a
  fork PR runs (`preview-pr.yml` skips forks, `deploy-pages.yml` only
  runs post-merge), landed on `main` after this branch was cut and only
  ran install/lint/lint:ts/build. Fixed by adding both steps to
  `site-ci-fork.yml` and correcting the workflow's own comment describing
  what it runs. Second, `site/CLAUDE.md` still said the site had "no test
  runner", now false since `node:test` was already in use with zero new
  dependencies; fixed the stale claim (cross-referencing the file's own
  "Don't add" policy rather than rewriting it) and added the two new
  scripts to both `CLAUDE.md`'s and `README.md`'s script lists, neither
  of which named them. Third, `SkillCard.tsx`'s comment on
  `showOpenLink = copyValue !== sourceUrl` still described the pre-fix
  behavior (`copyValue`/`sourceUrl` always equal for ecosystem cards,
  chip never rendering); with `sourceUrl` now derived separately, all 28
  GitHub-hosted cards' values differ, so the chip renders for them too, a
  second, direct link to the raw file alongside the header's link to the
  rendered page, confirmed on purpose in the real build output (PMLL's
  chip opens its raw `SKILL.md`, `stellarlight.xyz`'s card still shows
  none) and the comment rewritten to describe the new behavior. Fixed and
  pushed as `40e6ce6`, all four checks (`lint`, `lint:ts`,
  `check:ecosystem-links`, `test:ecosystem-links` at 12/12, `build`)
  clean. Kaan's bot then confirmed the fix live rather than on
  description alone: `site-ci-fork.yml` printed "29 entries checked, no
  blob-URL copyValue found" at `40e6ce6`, all 29 `copyValue` URLs still
  resolved (28 raw at `200 text/plain`, the one non-GitHub entry at
  `200 text/markdown`), and the check now runs in all three CI lanes,
  `site-ci-fork.yml` and `preview-pr.yml` pre-merge, `deploy-pages.yml`'s
  copy left as a post-merge backstop rather than the only enforcement
  point. This PR touches `.github/workflows/`, so the bot didn't merge it
  itself; @kaankacar did, the same day, at `254aff4f`.

  The `upto` spec thread itself went through the same evidence discipline
  as everything else here: an honest comparison against a competing
  design rather than defending our own, real fee numbers and
  independently-verified transaction XDR rather than trusting a PR
  description, and self-checks against external review that turned up
  four real gaps in our own code. All four now closed, each with its own
  commit and tests: `GET /discovery/resources` and `GET /discovery/search`
  exist, the catalog's dedupe key is `extra.uptoProfile`-aware, and
  `/supported` now reports `upto` for real via `UptoStellarScheme`, a
  real scheme implementation registered against `x402Facilitator`, with
  a real settled transaction through this facilitator's own `verify()`/
  `settle()` recorded in [`conformance/RESULTS.md`](conformance/RESULTS.md),
  not yet reflected on the live deployment (`docs/DEFERRED.md`). See "[The
  ecosystem is converging on this
  spec](#the-ecosystem-is-converging-on-this-spec-not-the-other-way-around)"
  above for what two other teams in this same RFP round did with this
  thread, and [`docs/UPTO-CONVERGENCE.md`](docs/UPTO-CONVERGENCE.md) for
  the full chronological writeup.

  The facilitator reports the outcome through the `EXTENSION-RESPONSES`
  header: `{"bazaar":{"status":"success"}}`, or
  `{"status":"rejected","rejectedReason":"routeTemplate failed validation"}`.
  We verified this end to end against the real Supabase project: a
  catalog row appears for a valid HTTP or MCP listing, and a crafted
  hostile `routeTemplate` produces no row and a specific rejection
  reason. [`docs/SELLERS.md`](docs/SELLERS.md) is the seller-facing
  how-to, including per-parameter descriptions, which search ranking now
  reads.

  Real external QA (2026-08-19) found two dead rows already live in the
  catalog: an opaque-origin bug's `null/...` URL, and an unrelated
  unreachable `localhost` URL from local testing, both cataloged before a
  write-time check ever existed. Every search query returned one of the
  two regardless of relevance, making ranking quality unjudgeable from
  outside. Fixed with a write-time gate, `checkCatalogUrl`, enforced
  inside `upsertCatalogResource` itself rather than only at the one call
  site that produced the opaque-origin bug, so it covers both bug classes
  and any future one that writes a URL the same way. A real one-time
  backfill against the live Supabase project followed: two bad rows
  before, one correct row after, confirmed by re-querying the table, not
  from the migration's own reported success.

  We then cataloged one real, externally reachable resource
  (https://periplo-testnet.fly.dev/demo/temperature-convert) for the
  first time: `apps/facilitator/src/demo-resource.ts`, a genuinely
  payment-gated temperature-conversion endpoint (self-facilitation, built
  on `@x402/hono`, `@x402/core`, and `@x402/stellar`, the same
  "do not reimplement the wire protocol" discipline as the rest of this
  project), deployed to the live facilitator. Real settlement:
  [`dde62ac5e67730a0751052a2dafc67dffc595df20bacbae9aaa1c758081deaea`](https://stellar.expert/explorer/testnet/tx/dde62ac5e67730a0751052a2dafc67dffc595df20bacbae9aaa1c758081deaea),
  Horizon-verified, and the resource is confirmed discoverable through
  `GET /discovery/search?query=temperature+conversion` against the live
  deployment, not just asserted. Two more real bugs turned up deploying
  it: `@hono/node-server` derives a request's scheme purely from
  `socket.encrypted`, with no `X-Forwarded-Proto` awareness, which is
  always false behind Fly's TLS-terminating proxy, fixed with an explicit
  `resource` URL on the route config rather than patching proxy
  internals; and `@x402/stellar`'s inherited 50,000-stroop fee ceiling
  was too low for real testnet Soroban fees that day (about 72,000
  stroops, confirmed against Horizon's own fee stats), fixed with a
  configurable ceiling on the deployed facilitator. Full writeup in
  `CLAUDE.md`'s Architecture section.
- [`packages/search`](packages/search) is hybrid retrieval: Postgres
  `tsvector`/GIN for lexical matching, pgvector/HNSW for semantic
  matching, fused with Reciprocal Rank Fusion. Embeddings come from
  `fastembed`'s `BGESmallENV15` model, running locally with no API key
  and no per-call cost. Every payment that catalogs a resource embeds it
  automatically, in the same write path Phase 4 already uses.
  [`eval/`](eval) is the honest measurement the spec asks for: 55 fixed
  resources, including deliberate near-duplicate clusters (`geocode` vs.
  `reverse-geocode`, `weather` vs. `weather-forecast` vs. `air-quality`,
  and more), and 300 graded queries, run with `pnpm eval` against the real
  Supabase project. Current numbers: **nDCG@10 0.9346, MRR 0.9226**,
  checked into [`eval/baseline.json`](eval/baseline.json), with CI failing
  the build if nDCG@10 regresses more than 5%. An earlier, smaller set (20
  resources, 40 queries, all in unrelated domains) scored 0.99, which
  turned out to be an overfitting signal rather than evidence of good
  ranking; the harder set above replaced it. The eval set is planned to
  grow further, toward 500 graded queries, and the search endpoint has
  not yet been hardened for production load.
- [`contracts/upto-settlement`](contracts/upto-settlement) is
  `UptoSettlement`, the Soroban contract behind `upto`'s `contract`
  profile: `require_auth_for_args` restricted to `(authorization,)` keeps
  the settled amount outside what the buyer signs, an atomic
  pull-pay-refund moves funds with no custody window, and a nonce in
  temporary storage enforces single use. 35 unit and property tests, plus
  a `cargo-fuzz` target that ran 47,630 executions against the
  ceiling/time-bound arithmetic with zero crashes. Deployed to
  `stellar:testnet`
  (`CAK3R734WLT4JU2XMQOJ6NIB3BWGPI442CH44EFJG5AORMXFE7G4MQFW`); a real
  **partial settlement** (buyer signs a ceiling, facilitator settles less)
  is recorded in [`conformance/RESULTS.md`](conformance/RESULTS.md),
  independently checked against Horizon, closing all three on-chain
  assumptions the spec PR marks open.

  Two Phase 6b extensions, additional evidence, not an SCF tranche
  deliverable:
  - **Zero-settlement: complete.** Real testnet transaction
    [`2138c0418a85e1bb29c2eab6cea6c76b3b0231d894450a35905053f36403d358`](https://stellar.expert/explorer/testnet/tx/2138c0418a85e1bb29c2eab6cea6c76b3b0231d894450a35905053f36403d358),
    verified against Horizon. The full ceiling is refunded when real
    usage is zero, and a second attempt with the same authorization was
    rejected on-chain (`AuthorizationConsumed`): the nonce is consumed
    even when the charge is zero.
  - **OpenZeppelin integration: in progress, not complete.** `budget.rs`
    (budget reconciliation tied to `actual_amount`, not the signed
    ceiling) and
    [`contracts/agent-smart-account`](contracts/agent-smart-account) (a
    real `ContextRule::CallContract`, not simulated) are built, tested,
    and deployed to `stellar:testnet`. There is still no real, signed
    transaction where the smart account is `authorization.from`; after
    exhausting independent isolation (version alignment, target-contract
    complexity, both ruled out), filed a detailed diagnostic issue
    against `OpenZeppelin/stellar-contracts`,
    [#839](https://github.com/OpenZeppelin/stellar-contracts/issues/839).
    Still open, still blocked. See `docs/DEFERRED.md`'s Phase 6b section
    for what was tried and the path to closing it.

## What Periplo is (planned)

The target is an x402 facilitator for Stellar: `verify`, `settle`, and
`supported`, for both `stellar:testnet` and `stellar:pubnet`, built on
`@x402/stellar`. It pairs with a **Bazaar**: an automatically-populated
catalog of x402-payable HTTP and MCP services, so an agent can find and
pay for a service without a human wiring up an integration first.

It also carries `upto`, a metered payment scheme for Stellar that a
plain SEP-41 allowance cannot express: it fails recipient binding
(`transfer_from` lets the spender choose any destination) and single-use
(an allowance is a standing balance). The network spec is open upstream at
[x402-foundation/x402#3098](https://github.com/x402-foundation/x402/pull/3098)
([issue #3097](https://github.com/x402-foundation/x402/issues/3097)), marked
ready for review. It documents two conformant profiles: `contract`, this
project's design, described below, and `stateless`, an alternative
contributed by [Iam0TI](https://github.com/Iam0TI) via
[0d1026/Rialto](https://github.com/0d1026/Rialto) and
[x402-foundation/x402#3134](https://github.com/x402-foundation/x402/pull/3134),
credited and merged into the same spec rather than left as a second,
competing PR. The Soroban contract, `contracts/upto-settlement`, is
built, tested, and deployed to `stellar:testnet`
(`CAK3R734WLT4JU2XMQOJ6NIB3BWGPI442CH44EFJG5AORMXFE7G4MQFW`), with a real
settled transaction recorded in
[`conformance/RESULTS.md`](conformance/RESULTS.md) closing all three
on-chain assumptions the spec PR marks open.

This is a response to the Stellar Community Fund RFP, "X402 Facilitator
with Bazaar (discovery) support" (SCF #45, Q3 2026). See
[`docs/SPEC.md`](docs/SPEC.md) for full scope: the build specification
this repository is built against.

## Architecture

The **Facilitator**, the automatic-cataloging edge into **Bazaar**,
**Search**, and the **`UptoSettlement`** contract are all real and
deployed. The Hub and the MCP discovery server are still planned, and
the facilitator does not call `UptoSettlement` yet from its own HTTP
routes. Full diagram and a component-by-component walkthrough, moved to
its own file rather than duplicated here, in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Verify it yourself

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm licence-check
```

Exact commands, local environment quirks (the Node version switch, real
integration-suite credentials, redeploying, checking CI's actual run
status rather than trusting the local gate) are in
[`docs/TOOLING.md`](docs/TOOLING.md).

Baseline transcripts backing the conformance claims above:
[`conformance/baseline/x402-org/supported.md`](conformance/baseline/x402-org/supported.md),
[`conformance/baseline/x402-org/discovery-404.md`](conformance/baseline/x402-org/discovery-404.md),
[`conformance/baseline/x402-org/verify-settle-malformed.md`](conformance/baseline/x402-org/verify-settle-malformed.md).
Settled transaction evidence: [`conformance/RESULTS.md`](conformance/RESULTS.md).

**2026-09-02: checked against Protocol 28 ("Adapter") ahead of its
2026-09-16 mainnet vote, real testnet (which has run it since
2026-08-27), not just read about.** `@stellar/stellar-sdk` bumped
`16.2.0` → `16.3.0`, the real LTS release that backports full Protocol
28 XDR support (CAP-85's new `ContractExecutable` variant, CAP-83)
onto the stable v16 API — not the newer `17.0.1`, which `@x402/stellar`
(this project's own dependency, spec §1: build on it, don't
reimplement) still hard-pins away from via its own `^16.0.1`
requirement, checked directly rather than assumed. Reviewed every
place this project's own code (TS and Rust) could match exhaustively
on a contract's executable type: nowhere does, confirmed by search, not
inferred. Then ran the real settlement cycle against live testnet under
the new protocol: `exact`, and `upto`'s `contract` profile both direct
against the deployed contract and through this facilitator's own
HTTP-route code, all three settled and Horizon-verified, recorded in
`conformance/RESULTS.md`. One real bug found and fixed along the way:
the `exact` demo script had never read the same fee-ceiling override
`serve.ts` does, so it failed on the real, current testnet fee
(95,461 stroops, already above the 72,000 that first required the
override in August). Full writeup, including a related-but-not-Periplo's-own
finding in OpenZeppelin's `stellar-accounts` crate, in `CLAUDE.md`.

CI (`.github/workflows/ci.yml`, badge above) runs the same gate on every
push. We confirmed it green with an
[organic push-triggered run](https://github.com/Eras256/Periplo/actions/runs/31222406798)
rather than a manual rerun. It was silently broken from Phase 1 to Phase
3 for two independently verified causes. Full timeline and raw evidence
are in [`docs/DEFERRED.md`](docs/DEFERRED.md).

## Deployment (what actually runs)

`apps/facilitator` is live on Fly.io, `stellar:testnet` only, at
**https://periplo-testnet.fly.dev**. It runs on 1 machine
(`shared-cpu-1x`, 512MB, region `iad`), kept running continuously, not
scaled to zero when idle: `fly.facilitator.toml` sets
`min_machines_running = 1` deliberately, so the one machine never stops,
because a cold start would break the interactive verify/settle latency
spec §8 asks for. No `periplo-mainnet` app exists yet: there is no
mainnet fee-sponsor key to back one.

```bash
fly deploy --config fly.facilitator.toml --dockerfile Dockerfile.facilitator -a periplo-testnet
```

Run this from the repo root. The Docker build context needs the pnpm
workspace root, even though the image only ships `apps/facilitator`.
Secrets (`STELLAR_FEE_SPONSOR_SECRET`, `STELLAR_NETWORK`) are set with
`fly secrets set -a periplo-testnet`. They are never committed or
placed in `fly.facilitator.toml`.

## Licence

Apache-2.0. See [`LICENSE`](LICENSE). No AGPL or other copyleft
dependency is permitted anywhere in the dependency path. This is
enforced in CI by `packages/licence-check`.

## Dependency versions

Pinned versions and their live-registry verification dates are tracked
in the build spec's manifest ([`docs/SPEC.md` §2](docs/SPEC.md#2-verified-dependency-manifest))
and re-checked incrementally per phase. First verified 2026-08-07;
**re-verified 2026-08-19**, the full pass spec §11 requires before
submission, done 8 days after the actual 2026-08-11 submission rather
than before it. `docs/SPEC.md` §2 has the full table and the reasoning
behind the two versions deliberately not bumped to the latest available
(`@x402/core`'s family, held at 2.22.0 pending evaluation of real,
breaking-shaped changes in 2.23.0, `spendControls`'s new default cap,
renamed exports, a new required `createSIWxPayload` argument, not
release age; `soroban-sdk`, held at the version the already-deployed
`UptoSettlement` contract was actually built against). See
[`docs/DEFERRED.md`](docs/DEFERRED.md) for why the first pass ran late.

## Documentation

- [`docs/SPEC.md`](docs/SPEC.md): the full build specification, phased
  0 to 10.
- [`CLAUDE.md`](CLAUDE.md): repo guide for Claude Code sessions
  (commands, architecture, working rules).
- [`docs/TOOLING.md`](docs/TOOLING.md): exact commands and
  machine-specific setup, split out from `CLAUDE.md` so architecture
  and operational how-to don't compete for space in one file.
- [`docs/SKILLS.md`](docs/SKILLS.md): which `stellar-build` skills are
  actually available in the build environment, mapped to spec phases.
- [`docs/DEFERRED.md`](docs/DEFERRED.md): everything deliberately not
  built yet, and every environment divergence from the spec's
  assumptions.
- [`docs/MEMORY.md`](docs/MEMORY.md): running log of why things were
  built the way they were.
- [`docs/ECOSYSTEM.md`](docs/ECOSYSTEM.md): a partial, dated snapshot of
  the competitive landscape. Regenerate it before relying on it.
- [`docs/SELLERS.md`](docs/SELLERS.md): how a resource server lists a
  Stellar service on the Bazaar (Phase 4).
- [`docs/SELF-FACILITATION.md`](docs/SELF-FACILITATION.md): running the
  facilitator inside your own resource server, no external operator at
  all (deployment path 3, spec §5).
- [`docs/INTEROP.md`](docs/INTEROP.md): where Periplo's bazaar extension
  handling diverges from the canonical `@x402/extensions/bazaar`
  implementation, and why (Phase 4).
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): the system diagram and
  a plain-English explanation of the stack.
- [`docs/DECENTRALIZATION.md`](docs/DECENTRALIZATION.md): why the catalog
  is off-chain by design, and what "decentralized" actually means here
  (replicability, not on-chain storage).
- [`docs/INFRASTRUCTURE.md`](docs/INFRASTRUCTURE.md): what runs where,
  who pays for it today, and the honest state of who pays after the
  grant (not yet decided).
- [`docs/MAINTENANCE.md`](docs/MAINTENANCE.md): how conformance is kept
  current as the upstream wire spec evolves, traced against this
  project's real history, not promised in the abstract.
- [`docs/PRIVACY.md`](docs/PRIVACY.md): what Periplo collects (nothing
  personal, checked directly against the running code) and why.
- [`docs/UPTO-CONVERGENCE.md`](docs/UPTO-CONVERGENCE.md): the `upto`
  spec's chronological devlog, including two competitors converging on
  it instead of forking their own.
- [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md): the spec §6 threat/
  control/test table, formalized with a pointer to where each control
  actually lives and what proves it, citable directly without reading
  the full build spec first.
- [`docs/FOR-REVIEWERS.md`](docs/FOR-REVIEWERS.md): a one-page,
  human-written index for a panel reviewer, not a Claude Code session:
  what to look at, in what order, and what each link confirms, in under
  ten minutes.
