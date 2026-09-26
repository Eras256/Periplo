# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.
This file is deliberately short: constraints, commands and pointers. The public
evidence (transaction hashes, upstream issues, conformance transcripts) lives in
[`README.md`](README.md), [`docs/DEFERRED.md`](docs/DEFERRED.md) and
[`conformance/RESULTS.md`](conformance/RESULTS.md), where it is re-checked on
every push by `packages/evidence-check`.

## What this is

Periplo: the discovery layer for x402-payable services on Stellar, built for a
Stellar Community Fund RFP Track submission responding to "X402 Facilitator
with Bazaar (discovery) support" (SCF #45, Q3 2026). RFP Track is
panel-reviewed, not community-voted: reviewers test the wire protocol
directly rather than read prose claiming conformance.

The full build plan is [`docs/SPEC.md`](docs/SPEC.md). It is phased (0 to 10);
each phase ends in a gate command that must exit 0 before the next phase
starts. Read it before starting any phase, and do not start a phase whose
predecessor has not cleared its gate.

**Current status:** Phase 6 (`upto` on Stellar) is complete. Phase 6b
(additional evidence, not a tranche deliverable) has contract-level results
and one open blocker, described below. Phase 7 (MCP discovery server) is not
started. Seller-side and buyer-side helper libraries exist in
`packages/helpers`; the sponsor-key rotation runbook and runway monitoring are
in [`docs/OPERATIONS.md`](docs/OPERATIONS.md). Remaining gaps are tracked, not
silently closed: see the roadmap section of `docs/DEFERRED.md`.

## Where things are

- [`docs/SPEC.md`](docs/SPEC.md): the phased build plan and gate commands.
- [`docs/DEFERRED.md`](docs/DEFERRED.md): divergences from the spec, blockers,
  the roadmap, and the log of environment differences. Update it whenever
  reality disagrees with the spec.
- [`docs/UPTO-CONVERGENCE.md`](docs/UPTO-CONVERGENCE.md): the `upto` wire-spec
  convergence story.
- [`docs/TOOLING.md`](docs/TOOLING.md): exact commands, credentials, local
  integration tests, redeploying, checking CI, and machine-specific notes.
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md), [`docs/SELLERS.md`](docs/SELLERS.md),
  [`docs/INTEROP.md`](docs/INTEROP.md), [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md),
  [`docs/FOR-REVIEWERS.md`](docs/FOR-REVIEWERS.md),
  [`docs/RFP-COMPLIANCE.md`](docs/RFP-COMPLIANCE.md).
- [`conformance/RESULTS.md`](conformance/RESULTS.md) (settled transaction
  hashes, cross-checked against Horizon), [`conformance/baseline/`](conformance/baseline)
  (captured transcripts against the public reference facilitator; regenerate,
  never hand-edit) and [`docs/conformance/`](docs/conformance) (dated runs of
  the official `x402-foundation/x402` e2e suite against the live deployment).
- Code: [`packages/bazaar`](packages/bazaar), [`packages/search`](packages/search),
  [`packages/helpers`](packages/helpers), [`packages/licence-check`](packages/licence-check),
  [`packages/evidence-check`](packages/evidence-check), [`eval/`](eval),
  [`supabase/`](supabase), [`apps/facilitator`](apps/facilitator),
  [`contracts/upto-settlement`](contracts/upto-settlement).

**CI passing locally is not the same claim as CI passing.** The workflow once
failed to run at all for several phases while every local gate was green
(evidence in `docs/DEFERRED.md`). See
[`docs/TOOLING.md`](docs/TOOLING.md#checking-ci) for the check command.

**Live deployments.** A Supabase project and a Stellar testnet fee-sponsor
account are live. `apps/facilitator` is live on Fly.io at
`https://periplo-testnet.fly.dev` (`stellar:testnet` only, one machine). The
`fly` CLI must be authenticated as the Fly account that owns the app; a
different Fly account will not list it in `fly apps list`. See
`docs/TOOLING.md` for redeploying and the account gotcha.

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

pnpm workspace: `packages/*` and `apps/*` (`pnpm-workspace.yaml`); `eval/`
has its own explicit entry there so it can resolve `@periplo/bazaar` and
`@periplo/search` as workspace dependencies. TypeScript project references:
the root `tsconfig.json` lists `references` to each package's `tsconfig.json`,
which extends `tsconfig.base.json`. `pnpm typecheck` runs `tsc -b`: **a new
package needs a `{ "path": "packages/<name>" }` entry in the root
`tsconfig.json`'s `references`, or `tsc -b` silently skips it.**

Built: the packages above, `apps/facilitator`, and `contracts/upto-settlement`
(a standalone Cargo project, deliberately outside the pnpm workspace, deployed
to `stellar:testnet` at `CAK3R734WLT4JU2XMQOJ6NIB3BWGPI442CH44EFJG5AORMXFE7G4MQFW`).
Planned, not built: `apps/hub`, `packages/mcp`, `spec/`, a `conformance/`
runner, `examples/`. Do not create empty placeholder directories for phases
that have not started (spec §12: no invented scope).

- `packages/licence-check` and `packages/evidence-check` are the pattern for a
  CI-gate package: pure logic in one file, fully unit tested, plus a thin CLI
  wrapper exercised only through the gate. The licence gate is a hard block on
  the production graph and a warning for devDependency-only copyleft.
  `evidence-check` re-fetches every cited transaction hash (Horizon), GitHub
  issue/PR link, internal doc link and the live `GET /supported`; it needs
  network, so CI runs it as its own step, not inside `pnpm run ci`.
- `packages/bazaar` is the catalog trust boundary (route-template and
  catalog-URL checks, the Supabase client, the catalog write path).
  `packages/search` is hybrid retrieval (lexical plus local embeddings, fused
  with Reciprocal Rank Fusion). `eval/` is the Phase 5 gate (`pnpm eval`,
  nDCG@10 regression check against `eval/baseline.json`).
- `packages/helpers` has the seller-side `definePaidResource` (one declarative
  params map drives both the discovery schema and the runtime parser) and the
  buyer-side discover/pay/retry client. It is not yet wired into
  `demo-resource.ts`; tracked in `docs/DEFERRED.md`.
- `apps/facilitator`: `core.ts` (importable `verify`/`settle`/`supported`
  core over `@x402/core` + `@x402/stellar`), `app.ts` (thin Hono HTTP layer),
  `boot-safety.ts` (refuses to boot with a fund-moving sponsor key),
  `discovery.ts` and `discovery-routes.ts` (cataloging and
  `GET /discovery/*`), `demo-resource.ts` (one payment-gated resource, self-facilitated),
  `upto-stellar-scheme.ts` (`upto` verify/settle), `telemetry.ts` (`GET /status`),
  `serve.ts` (Node entry point and environment loading).
- `contracts/upto-settlement`: `settle(authorization, actual_amount)` uses
  `require_auth_for_args((authorization,))` so the buyer signs a ceiling and
  the charge stays outside what is signed. Time bounds are ledger sequences;
  the nonce lives in `temporary()` storage; `settle` asserts a zero contract
  balance at the end as a runtime check. Property tests build their own `Env`
  with `capture_snapshot_at_drop: false` to avoid thousands of snapshot files.

### Traps that have already bitten (each is documented inline where it applies)

- **`@x402/stellar` imports.** Import `ExactStellarScheme` for the facilitator
  from `@x402/stellar/exact/facilitator`, not the package's main entry (the
  main entry re-exports the client variant under the same class name). Any
  `paymentRequirements` for the `exact` scheme needs `extra.areFeesSponsored: true`.
- **Supabase types.** `Database`/`ResourceRow` in `packages/bazaar/src/db/client.ts`
  must stay declared with `type`, not `interface`, or `supabase-js` silently
  resolves every result to `never`.
- **`Array.from(...)` on fastembed output is load-bearing.** It returns a
  `Float32Array` at runtime; `JSON.stringify` of that is `{"0":v,...}`, which a
  Postgres `vector` column rejects.
- **Catalog keys.** Key on the client's original, un-decoded `routeTemplate`;
  decoding is for validation only. `checkCatalogUrl` runs inside
  `upsertCatalogResource` and rejects `null/*`, non-http(s)/mcp schemes and
  local hosts.
- **Cataloging is settle-only.** `/verify` must never call
  `processBazaarExtension`; a verify-only signal would let catalog rows be
  produced with no balance movement.
- **Fee ceiling.** `MAX_TRANSACTION_FEE_STROOPS` (`serve.ts`, 200,000 on the
  deployment) exists because real Soroban fees exceeded `@x402/stellar`'s
  inherited 50,000 default. Any script that builds a scheme must read it too.
- **Channel-account pool.** One scheme instance per network, each built only
  from its own pool (the round-robin has no network awareness). Concurrency
  safety extends exactly to pool size; oversubscription fails closed per call.
- **Self-facilitation settles in-process.** `demo-resource.ts` never calls
  `/settle`; telemetry and cataloging must be wired into its `onAfterSettle`
  hook as well.
- **Behind Fly's TLS proxy**, `@hono/node-server` reports `http://` request
  URLs; `DemoResourceConfig.baseUrl` supplies the canonical one.
- **Bazaar canonical URLs strip the query string** by design
  (`extractDiscoveryInfo`); the buyer client re-adds the declared example
  `queryParams` before paying. `mcp://` URLs also resolve to a broken `null/...`
  canonical URL upstream (see `docs/INTEROP.md`).
- **`EXTENSION-RESPONSES`.** `HTTPFacilitatorClient` discards the header, so
  `/settle` also returns the outcome in the response body's `extensions` field.
- **`upto` scheme mechanics.** `settle()` reuses the client's signed auth entry
  verbatim; the facilitator's own `require_auth()` needs a `sourceAccount`
  entry that only appears when simulating with the facilitator as source (so
  simulate twice); `_verify` must simulate a facilitator-sourced rebuild, never
  the client's payload as received. `/supported` advertises `upto` only where
  `UPTO_SETTLEMENT_CONTRACT_TESTNET`/`_PUBNET` is configured.
- **`Dockerfile.facilitator`.** Build `@periplo/bazaar` and `@periplo/search`
  before the facilitator, copy each package's `node_modules` (not just `dist/`),
  set `ONNXRUNTIME_NODE_INSTALL_CUDA=skip` before `pnpm install`, and copy
  `src/browser` into `dist/browser` (the browser bundle is excluded from the
  Node build; it has its own nested `tsconfig.json` with the DOM lib).
- **Em dashes.** Prose in docs is written without them (verbatim quotes from
  reviewers are exempt). To find them use `grep -rl $'\xe2\x80\x94'`; the
  `-P` form gives false positives here.

### Phase 6b: `agent-smart-account` (open blocker)

`contracts/agent-verifier`, `contracts/agent-smart-account` and
`contracts/upto-settlement/src/budget.rs` build on OpenZeppelin's
`stellar-accounts`. Zero-settlement is done and evidenced (`conformance/RESULTS.md`).
A single-context `Signer::Delegated` authorization settled for real
([`428021a6...`](https://stellar.expert/explorer/testnet/tx/428021a6ef648937bf0edeec96d42f13e44447eac9b036c127c90cf4bebdd71b)).
The full two-context `settle()` plus nested `transfer` still fails with
`UnvalidatedContext #3002`, and no real signed transaction exists for
`agent-smart-account` itself.

- `OpenZeppelin/stellar-contracts#839` was closed COMPLETED on 2026-09-02: the
  trap was never `__check_auth`, it was a discovery gap (recording-mode
  simulation never runs `__check_auth`, so a `require_auth_for_args` on a second
  address cannot be discovered). Root cause found through an independent
  reproduction, filed as
  [`OZ#863`](https://github.com/OpenZeppelin/stellar-contracts/issues/863).
- `OZ#868` (merged 2026-09-10) changes what `Signer::Delegated` authorizes to an
  `AuthDigestPreimage` struct. It ships only in the unreleased `0.8.0`.
- `OZ#866` (merged 2026-09-26) moves `stellar-accounts` `main` to
  `soroban-sdk 28.0.0` and fixes `OZ#865`. No release contains it:
  `stellar-accounts` on crates.io is still `0.7.2` (checked 2026-09-26).
- `agent-smart-account` and `agent-verifier` stay on `soroban-sdk 26.1.1`
  because `stellar-accounts 0.7.2` requires `^26.1`.
- Decision: wait for the `0.8.0` release before re-attempting the two-context
  case; do not pin a git rev, and do not reopen `#839` without a new concrete
  trigger. Full history in `docs/DEFERRED.md`'s Phase 6b section.

Upstream issues and PRs cited in the docs are re-checked by the
`upstream-github-check` skill; `docs/DEFERRED.md` is the record.

## Working rules (spec §12)

- One phase per session block; report the gate command and its exit code
  before moving to the next phase.
- Never claim a passing test that was not actually run; paste real output.
- If a documented API or tool does not behave as `docs/SPEC.md` describes,
  trust reality: note the divergence in the commit body and in
  `docs/DEFERRED.md`, and continue, do not stall.
- When genuinely blocked (missing credentials, or an outward-facing action
  like a repo push or external account creation that needs a human's
  go-ahead), log it in `docs/DEFERRED.md` and keep going on everything that
  does not depend on it.
- Commit at every gate, conventional-commit format. The history is a
  reviewed deliverable, not just a log.
- This GitHub identity and this machine are shared with other
  projects. When deciding which project a piece of external work (a PR, an
  issue, a local checkout) belongs to, the user's own tracking record is the
  authority, not an incidental technical signal such as an author field, a
  shared local path or a user-level config file. Ask rather than infer.
- A CI gate failing on a commit that did not touch related code is not
  evidence of flakiness; find the real cause before re-running. `eval/` shares
  the production Supabase project (no isolated database), so two `pnpm eval`
  runs close together in time can race the same fixture rows and collapse
  nDCG@10. Compare the failing run's timestamps with the runs around it
  (`gh run list`, `gh run view --log`) before assuming noise.
- A PR against an upstream repo that requires signed commits (confirmed:
  `x402-foundation/x402`) must be signed from the commit that creates the
  branch. A dedicated SSH signing key exists at `~/.ssh/id_ed25519_signing`,
  registered on the GitHub account; set `gpg.format ssh`, `user.signingkey`
  and `commit.gpgsign true` local to that clone before the first commit. Verify
  with `gh api repos/<owner>/<repo>/commits/<sha> --jq
  '.commit.verification.verified'` and `gh pr checks <n>`;
  `git log --show-signature` alone is unreliable here. Do not report a PR as
  finished until checks are green, not just until `gh pr create` returns a URL.
- Local commit state is not remote state, and a prior read of an external
  source is not the source. Before reporting a commit as pushed, `git fetch`
  and compare against `origin/<branch>`. Before citing or paraphrasing any
  external issue, PR or file, re-fetch it the same turn.

## Environment notes specific to this machine

See [`docs/TOOLING.md`](docs/TOOLING.md#environment-notes-specific-to-this-machine)
for machine-specific setup: `docs/DEFERRED.md`'s role as the environment-divergence
log, the `docs/SKILLS.md` phase map, the `docs/ECOSYSTEM.md` snapshot caveat,
`docs/MEMORY.md`'s role as decision log, and the local Codex config note.
