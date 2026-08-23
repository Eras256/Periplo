# Periplo

[![CI](https://github.com/Eras256/Periplo/actions/workflows/ci.yml/badge.svg)](https://github.com/Eras256/Periplo/actions/workflows/ci.yml)

The discovery layer for x402-payable services on Stellar.

**Live now:** [periplo-testnet.fly.dev](https://periplo-testnet.fly.dev),
the facilitator running on `stellar:testnet`. Try
[`GET /`](https://periplo-testnet.fly.dev/) or
[`GET /supported`](https://periplo-testnet.fly.dev/supported) directly,
no setup required.

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
not self-assessment.

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
  **Own PR proposed, mergeable, awaiting maintainer:**
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
  rather than letting a flawed original repro stand uncorrected.
- **Automatic cataloging** lives in `apps/facilitator/src/discovery.ts`.
  A payment carrying the `bazaar` discovery extension is validated and
  written to the catalog on `/verify` and `/settle`. There is no
  separate registration step, no dashboard, and no API key.

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
  to attribute afterward." The PR is open, mergeable, reviewed three
  times by the person who reported the original bug, with a separate
  merge nudge from us the same week, blocked only on a maintainer's
  approval to merge.

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
  top-level node only. Running the new tests surfaced a second, genuinely
  separate bug along the way, not the one we set out to fix:
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
  should mirror, and a proposed fix. **Status: filed, not yet fixed,
  open.**

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
  it wasn't a duplicate. **Status: filed, not yet fixed, open.**

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
  open, awaiting a maintainer response.

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

Baseline transcripts backing the conformance claims above:
[`conformance/baseline/x402-org/supported.md`](conformance/baseline/x402-org/supported.md),
[`conformance/baseline/x402-org/discovery-404.md`](conformance/baseline/x402-org/discovery-404.md),
[`conformance/baseline/x402-org/verify-settle-malformed.md`](conformance/baseline/x402-org/verify-settle-malformed.md).
Settled transaction evidence: [`conformance/RESULTS.md`](conformance/RESULTS.md).

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
(`@x402/core`'s family, held back one release for being under 24 hours
old at check time; `soroban-sdk`, held at the version the already-deployed
`UptoSettlement` contract was actually built against). See
[`docs/DEFERRED.md`](docs/DEFERRED.md) for why the first pass ran late.

## Documentation

- [`docs/SPEC.md`](docs/SPEC.md): the full build specification, phased
  0 to 10.
- [`CLAUDE.md`](CLAUDE.md): repo guide for Claude Code sessions
  (commands, architecture, working rules).
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
