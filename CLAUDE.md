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
that must exit 0 before the next phase starts. **Current status: Phase 2
complete** — see [`docs/DEFERRED.md`](docs/DEFERRED.md),
[`conformance/baseline/`](conformance/baseline),
[`packages/bazaar`](packages/bazaar), and [`supabase/`](supabase) for what
exists concretely. Do not start a phase whose predecessor hasn't cleared
its gate.

**Supabase project is live** (provisioned mid-build, not self-hosted by
this session). Credentials live in a local, gitignored `.env` and in this
repo's GitHub Actions secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) — never in a committed file. Run
`export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22` then
`pnpm test` locally to exercise the real RLS integration suite in
`packages/bazaar/src/db/resources.integration.test.ts`; it skips itself
(not a failure) when those env vars aren't set.

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
pnpm ci                 # typecheck && lint && test && licence-check, in that order
```

Run a single test file: `pnpm exec vitest run path/to/file.test.ts`.

## Architecture

pnpm workspace: `packages/*` and `apps/*` (`pnpm-workspace.yaml`).
TypeScript project references — root `tsconfig.json` lists `references` to
each package's `tsconfig.json`, which extends `tsconfig.base.json`.
`pnpm typecheck` runs `tsc -b` from the root: **a new package needs a
`{ "path": "packages/<name>" }` entry added to root `tsconfig.json`'s
`references` array, or `tsc -b` silently skips it.**

Only `packages/licence-check` and `packages/bazaar` exist so far (Phases
0–1). Everything else in the target layout (`apps/facilitator`, `apps/hub`,
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
mechanism — Phase 4 supplies the actual discovery-payload schema, this
package only supplies the mechanism). `routeTemplate` never goes through
soft-drop: it's the catalog key, so an invalid one hard-rejects the whole
listing rather than being softly dropped. Catalog storage must always key
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

`conformance/baseline/` holds real, captured HTTP transcripts (not
reconstructed from documentation) against the public reference facilitator
(`x402.org`). Treat it as the empirical spec for "conformant" that later
phases build against — regenerate/extend it when the reference
facilitator's behaviour changes, don't hand-edit the transcripts.

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
