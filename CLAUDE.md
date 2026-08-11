# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Periplo: the discovery layer for x402-payable services on Stellar, built for a
Stellar Community Fund RFP Track submission responding to "X402 Facilitator
with Bazaar (discovery) support" (SCF #45, Q3 2026). RFP Track is
panel-reviewed, not community-voted — reviewers test the wire protocol
directly rather than read prose claiming conformance.

The full build plan lives at [`docs/SPEC.md`](docs/SPEC.md) — read it before
starting any phase. It is phased (0–10); each phase ends in a gate command
that must exit 0 before the next phase starts. **Current status: Phase 4
(automatic cataloging) complete, Phase 5 (search) next** — see
[`docs/DEFERRED.md`](docs/DEFERRED.md),
[`conformance/RESULTS.md`](conformance/RESULTS.md),
[`conformance/baseline/`](conformance/baseline),
[`packages/bazaar`](packages/bazaar), [`supabase/`](supabase), and
[`apps/facilitator`](apps/facilitator) for what exists concretely. Do not
start a phase whose predecessor hasn't cleared its gate.

**CI passing locally is not the same claim as CI passing.** `.github/workflows/ci.yml`
silently failed to run at all from Phase 1 through Phase 3 (two stacked,
independently-diagnosed causes — a malformed reusable-workflow reference,
then a private-repo Actions-minutes billing block once that was fixed;
full evidence in `docs/DEFERRED.md`), while every phase's local `pnpm ci`
was genuinely green the whole time. Check `gh run list -R Eras256/Periplo`
periodically — don't assume CI mirrors the local gate.

**Supabase project and a Stellar testnet fee-sponsor account are both
live** (provisioned mid-build, not self-hosted by this session).
Credentials live in a local, gitignored `.env` and in this repo's GitHub
Actions secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `STELLAR_FEE_SPONSOR_SECRET`,
`STELLAR_FEE_SPONSOR_PUBLIC`) — never in a committed file. Run
`export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22` then
`pnpm test` locally to exercise the real integration suites in
`packages/bazaar/src/db/resources.integration.test.ts` and
`apps/facilitator/src/core.test.ts`; both skip themselves (not a failure)
when their env vars aren't set.

**`apps/facilitator` is also live on Fly.io** at
`https://periplo-testnet.fly.dev` (`stellar:testnet` only, 1 machine —
scaled down from Fly's default-2 via `fly scale count 1`; `docs/DEFERRED.md`
has the reasoning) — pulled forward from Phase 10 at explicit request, not
a sign the rest of Phase 10 is done. Redeploy with
`fly deploy --config fly.facilitator.toml --dockerfile Dockerfile.facilitator -a periplo-testnet`
from the repo root; secrets are set via `fly secrets set -a periplo-testnet`,
never in `fly.facilitator.toml`.

**Real Stellar testnet test fixtures exist for exercising a live payment**,
not just `PTEST` (the self-issued token from Phase 3, since Circle's
faucet has no API): `STELLAR_TEST_BUYER_PUBLIC` now also holds real
testnet USDC with an established trustline
(`GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` is the real
issuer — read authoritatively off the SAC contract's own `name()` call,
not guessed). `apps/facilitator/scripts/settle-demo.ts` can target either
asset by env var.

## Non-negotiable constraints (spec §1) — check every change against these

- **Apache-2.0 only.** No AGPL, no other copyleft, anywhere in the shipped
  dependency path. `pnpm licence-check` enforces this against `dependencies`
  + `optionalDependencies` (not `devDependencies` — see the comment block in
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
  without evidence — prefer "not implemented" to an optimistic claim.
- Reference repos with no explicit permissive licence (listed in
  `docs/SPEC.md` §1 point 8) are read-only inspiration only — never copy
  code from them or add them as a dependency.

## Commands

Requires Node ≥22 — `pnpm@11.20.0` (pinned) will not run on Node <22.13, it
imports the `node:sqlite` built-in. This machine's default shell Node is
20.19.6; switch first in every new shell:

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22
```

(`.nvmrc` pins `22`, but this harness starts a fresh non-login shell per
tool call, so nvm's automatic `.nvmrc` pickup doesn't persist between
commands — run the line above each time.)

```bash
pnpm install
pnpm typecheck        # tsc -b across all workspace packages (project references)
pnpm lint              # biome check .
pnpm lint:fix           # biome check --write .
pnpm test               # vitest run, workspace-wide
pnpm test:watch
pnpm licence-check      # AGPL/copyleft gate — see constraints above
pnpm run ci             # typecheck && lint && test && licence-check, in that order
```

**Use `pnpm run ci`, not bare `pnpm ci`.** `ci` is a reserved pnpm CLI
command (alias for `clean-install` — `pnpm clean` + `pnpm install
--frozen-lockfile`) that shadows a package.json script of the same name;
bare `pnpm ci` silently reinstalls dependencies instead of running the
gate, with no error pointing at the shadowing. `pnpm run ci` forces
package.json script resolution. Found empirically running this exact
command during Phase 4 (`pnpm help ci` confirms the alias) — every
individual step (`typecheck`/`lint`/`test`/`licence-check`) was still run
and verified separately throughout Phases 0–3, so this was a misleading
shortcut, not a gap in what actually got checked.

Run a single test file: `pnpm exec vitest run path/to/file.test.ts`.

## Architecture

pnpm workspace: `packages/*` and `apps/*` (`pnpm-workspace.yaml`).
TypeScript project references — root `tsconfig.json` lists `references` to
each package's `tsconfig.json`, which extends `tsconfig.base.json`.
`pnpm typecheck` runs `tsc -b` from the root: **a new package needs a
`{ "path": "packages/<name>" }` entry added to root `tsconfig.json`'s
`references` array, or `tsc -b` silently skips it.**

Only `packages/licence-check`, `packages/bazaar`, and `apps/facilitator`
exist so far (Phases 0–3). Everything else in the target layout (`apps/hub`,
`packages/search`, `packages/mcp`, `packages/helpers`, `contracts/`,
`spec/`, `conformance/` runner, `examples/`) is **planned, not built** — see
`docs/SPEC.md` §3 for what belongs where. Don't create empty placeholder
directories for phases that haven't started (spec §12: no invented scope).

`packages/licence-check` is the pattern for any future CI-gate package:
pure classification logic in one file (`classify.ts`, fully unit tested),
plus a thin CLI wrapper (`cli.ts`) that shells out to real tooling
(`pnpm licenses list --json`) and is exercised only through the gate itself,
not unit tests. It deliberately checks the **production** dependency graph
(`--prod`: `dependencies` + `optionalDependencies`) as the hard, blocking
gate, and reports devDependency-only copyleft findings as warnings — the
concrete case that motivated the split is `vitest` → `vite` →
`lightningcss` (MPL-2.0), unavoidable while pinning `vitest@4.1.10` but
never bundled into a deployed service.

`packages/bazaar` is the catalog trust boundary (Phase 1):
`checkRouteTemplate` (decode-fully-THEN-validate against traversal/absolute/
protocol-relative attacks, incl. percent-encoding and backslash variants —
see the module doc in `route-template.ts` for the full reasoning) and
`softDropFields` (a generic, schema-agnostic field-level soft-drop
mechanism). In the event, Phase 4's actual discovery-payload schema
validation goes through `@x402/extensions/bazaar`'s own Ajv-based
`validateDiscoveryExtension` instead — atomic, not per-field: an invalid
`info`/`schema` rejects the whole extension rather than softly dropping one
bad field, because that's how the upstream package (and the wire spec it
implements) actually validates it. `softDropFields` itself is still real
and tested, just not wired into Phase 4's own path — see `docs/DEFERRED.md`
for where it would actually apply (`resource.serviceName`/`tags`/`iconUrl`,
which upstream soft-drop-sanitizes but Periplo's current Phase 2 schema has
no columns for yet). `routeTemplate` never goes through soft-drop: it's the
catalog key, so an invalid one hard-rejects the whole listing rather than
being softly dropped. Catalog storage must always key
on the client's **original** (un-decoded) `routeTemplate` string — decoding
is for validation only, never for what gets stored.

`supabase/` (Phase 2) is the Supabase CLI's own project layout —
`config.toml` plus `migrations/*.sql`, applied with `supabase db push
--db-url <pooler-url>` (the direct/session connection is IPv6-only and
unreachable from this build's sandbox; the pooler works fine for plain DDL
— see `docs/DEFERRED.md`). `packages/bazaar/src/db/` is the TypeScript
side: `client.ts` (typed `createAnonClient`/`createServiceRoleClient`
factories — **`Database`/`ResourceRow` must stay declared with `type`, not
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
reimplement verify/settle). `src/core.ts` is the importable library core —
`createFacilitatorCore(config)` wraps `@x402/core`'s `x402Facilitator`
dispatching to `@x402/stellar`'s `ExactStellarScheme`, which already
implements the per-payment facilitator-safety checks internally (not
reimplemented here). `src/app.ts` is a thin Hono HTTP layer around that
core — deployment paths 1/2 (hosted/self-hosted); path 3
(self-facilitation inside a resource server) imports `core.ts` directly
and skips HTTP entirely. `src/boot-safety.ts` is this repo's own addition,
not from the libraries: refuses to construct a `FacilitatorCore` if any
configured fee-sponsor account holds a non-native-XLM balance (spec §1
constraint 3 — a fee-only account has nothing to move).

**Two import traps specific to `@x402/stellar`, both documented inline
where they'd bite:**
- Import `ExactStellarScheme` for the facilitator from
  `@x402/stellar/exact/facilitator`, **not** the package's main entry —
  the main entry re-exports the *client* variant under the same class
  name. Wrong import type-errors confusingly instead of pointing at the
  real cause.
- Any `paymentRequirements` built for the Stellar `exact` scheme needs
  `extra.areFeesSponsored: true`, or the client throws before it even
  builds the transaction.

`src/serve.ts` binds `@hono/node-server` (MIT, added outside spec §2's
manifest — flagged per working rule 6, not silently added, when the
project owner asked for the Fly deploy directly) to `0.0.0.0:$PORT`,
reading fee-sponsor secrets from `STELLAR_FEE_SPONSOR_SECRET[_TESTNET|_PUBNET]`
and (Phase 4) `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` for the catalog
client — the latter pair is optional; the facilitator boots and serves
fine without them, it just validates bazaar extensions without persisting.
Tests still exercise the app via Hono's in-memory `app.request()` — no
network needed for `pnpm test`. `GET /` returns a small JSON description
of the service (no claims beyond what's real — no frontend exists, see
`apps/hub` below); it existed only as a bare 404 before a live user check
surfaced the gap.

`src/discovery.ts` (Phase 4) is automatic cataloging: `processBazaarExtension`
extracts and validates a payment payload's `extensions.bazaar` using the
official `@x402/extensions/bazaar` package (`extractDiscoveryInfo`,
`validateDiscoveryExtension`, `validateDiscoveryExtensionSpec` — same
"don't reimplement the wire protocol" principle §1 applies to verify/settle,
extended here; flagged as an outside-manifest addition per working rule 6),
except `routeTemplate` itself, which is checked with `packages/bazaar`'s own
`checkRouteTemplate` instead — upstream's equivalent is strictly weaker
(single percent-decode pass vs. Periplo's bounded-repeated decode) and
doesn't satisfy the Phase 4 gate's hard-reject requirement. Full comparison
and a genuine upstream bug found via the live integration test (`mcp://`
URLs resolve to a broken `null/...` catalog URL because `mcp:` isn't a
WHATWG special scheme) are in [`docs/INTEROP.md`](docs/INTEROP.md). `app.ts`
wires this into `/verify` and `/settle` — cataloging only runs after the
underlying payment call itself succeeds (the facilitator is a trust
boundary), and the outcome is reported via the `EXTENSION-RESPONSES` header
regardless of whether a catalog client is configured. `packages/bazaar/src/db/catalog.ts`
is the write path: reads the existing row (if any) by the
`(url, route_template, tool_name)` key, merges the new payment option into
`accepts` rather than duplicating rows, and upserts. Seller-facing docs
(including per-parameter descriptions, the primary input to Phase 5's
search ranking) are in [`docs/SELLERS.md`](docs/SELLERS.md). The `mcp://`
canonical-URL bug documented in `docs/INTEROP.md` §2 is filed upstream as
[x402-foundation/x402#3121](https://github.com/x402-foundation/x402/issues/3121)
(bug report, not a spec PR — see `CONTRIBUTING.md`'s scope for issues).

`Dockerfile.facilitator` builds and ships `@periplo/bazaar` alongside
`@periplo/facilitator` — apps/facilitator had no runtime dependency on
packages/bazaar before Phase 4, so this wasn't needed until now. Two
things the image needs or the deploy crash-loops: `pnpm --filter
@periplo/bazaar build` before the facilitator build step (`tsc -p`
doesn't auto-build referenced projects), and copying
`packages/bazaar/node_modules` into the runtime stage, not just `dist/`
(pnpm gives every workspace package its own symlinks to its own deps).
Found live against the real deployment on the first Phase 4 deploy — see
`docs/DEFERRED.md`.

`README.md`, `docs/INTEROP.md`, and `docs/SELLERS.md` went through a
prose-register pass (em dashes, negation-for-emphasis, bold overuse
removed; every fact and code block verified unchanged). `docs/DEFERRED.md`,
`docs/SPEC.md`, and this file have not — still carry the heavier register,
lowest priority since reviewers read them less than the README/INTEROP/SELLERS
trio.

`conformance/baseline/` holds real, captured HTTP transcripts (not
reconstructed from documentation) against the public reference facilitator
(`x402.org`). Treat it as the empirical spec for "conformant" that later
phases build against — regenerate/extend it when the reference
facilitator's behaviour changes, don't hand-edit the transcripts.
`conformance/RESULTS.md` is the evidence table of settled transaction
hashes, cross-checked against Horizon, not just printed and trusted.

## Working rules (spec §12)

- One phase per session block; report the gate command and its exit code
  before moving to the next phase.
- Never claim a passing test that wasn't actually run — paste real output.
- If a documented API or tool doesn't behave as `docs/SPEC.md` describes,
  trust reality: note the divergence in the commit body and in
  `docs/DEFERRED.md`, and continue — don't stall on it.
- When genuinely blocked (missing credentials, or an outward-facing action
  like a repo push or external account creation that needs a human's
  go-ahead), log it in `docs/DEFERRED.md` and keep going on everything that
  doesn't depend on it.
- Commit at every gate, conventional-commit format. The history is a
  reviewed deliverable, not just a log.

## Environment notes specific to this machine

- `docs/DEFERRED.md` tracks every divergence found between what
  `docs/SPEC.md` assumes about the environment (tool versions, MCP server
  availability, skill pack contents) and what's actually here, plus how
  each was resolved. Check it before assuming a tool or credential isn't
  available — several things that looked missing on first inspection
  turned out to just need a different check (e.g. the `stellar-build`
  skill pack: `ls ~/.claude/skills/` undercounts it — invoke skills by name
  via the `Skill` tool instead of trusting that directory listing).
- `docs/SKILLS.md` maps which `stellar-build` skills actually exist in this
  environment to the phases in `docs/SPEC.md`.
- `docs/ECOSYSTEM.md` is a partial, dated snapshot of the competitive
  landscape (LumenLoop catalogue) used for differentiation framing — not
  live data, regenerate before relying on it for the actual submission.
- `docs/MEMORY.md` is the running, committed decision log for *why* things
  were built the way they were — append to it at every phase, alongside
  `docs/DEFERRED.md` for what wasn't built.
- An OpenAI Codex config exists at `~/.codex/config.toml` on this machine
  (user-level, not project-level). Not read or imported — if useful here,
  run `/import` interactively to review what it would bring in.
