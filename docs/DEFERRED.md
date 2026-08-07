# Deferred — everything deliberately not built (yet), and why

Per master spec §12 rule 5: "When blocked, write the blocker here and continue
with everything that does not depend on it." This file is a running log, not
a one-time snapshot — update it every phase.

## Phase 0 — environment divergences from the spec's assumptions

The spec was written assuming a specific machine setup. This session's actual
environment differs in a few concrete ways. None of these blocked Phase 0;
they're recorded here because later phases depend on closing them.

### Raven MCP — added, not yet authenticated
`stellar-raven` was not connected at session start. It has now been added
(`claude mcp add --transport http stellar-raven "https://raven.stellar.buzz/mcp"`),
but `claude mcp list` reports `! Needs authentication`, and this session is
non-interactive (no browser available to complete an OAuth-style sign-in — see
the harness's own note on `claude.ai` connectors, which applies here too).
**Substitute used for Phase 0:** direct `WebFetch`/`curl` against the npm
registry, crates.io-equivalent checks, and live endpoints (x402.org
facilitator, developers.stellar.org), plus the `standards` skill's bundled
ecosystem reference. This produced verifiable, cited results (see
`conformance/baseline/`) but is slower than a single Raven `search`/`execute`
call would be. **Action needed:** whoever runs the next session should
complete the Raven sign-in interactively so later phases (especially 3, 6,
where live protocol/RPC semantics matter) can use it directly.

### The 45-skill `stellar-build` pack — present, just not where expected
`ls ~/.claude/skills/` only shows 13 symlinked skills. The fuller pack named
in the spec (`standards`, `agentic-payments`, `assets`, `dapp`,
`smart-contracts`, `tyler-architect`, `deploy-stellar-mainnet`,
`review-edge-case-hunter`, etc.) turned out to be real and available via the
`Skill` tool regardless — confirmed by invoking `standards` directly. Initial
assessment based on the symlink directory alone was wrong; noted here so the
correction is on record rather than silently discarded.

### Local Node / pnpm version drift
The spec pins Node ≥22 and `pnpm@11.20.0` (§2). This machine's preinstalled
toolchain is Node v20.19.6 and pnpm 10.30.3, with no `nvm`/`volta`/`fnm`
available to switch versions locally. Both pinned versions were confirmed to
exist on the npm registry (verified live, 2026-08-07), so the pins themselves
are correct — the gap is local-only.
**Handling:** `.github/workflows/ci.yml` pins Node 22 + pnpm 11.20.0 via
`actions/setup-node` and `pnpm/action-setup`, so the real gate (CI) runs on
the correct toolchain. `.npmrc` sets `engine-strict=false` so the *local* dev
loop on this machine doesn't hard-fail on the engines mismatch. Recommend
installing `nvm` (or similar) and running `nvm install 22` before Phase 3
onward, where runtime behaviour differences between Node 20 and 22 become
more likely to matter (native fetch/undici versions, etc.).

### §2 manifest — verification status
Only the packages actually wired into Phase 0 tooling were checked live
against the npm registry so far, all confirmed present at the pinned version
on 2026-08-07: `typescript@7.0.2`, `vitest@4.1.10`, `@biomejs/biome@2.5.7`,
`tsx@4.23.9` (registry `latest` has since moved to 4.23.10 — the pin is still
valid, just not `latest` anymore), `@types/node@26.1.2`, `pnpm@11.20.0`,
`hono@4.13.0`, `@stellar/stellar-sdk@16.2.0`, `@x402/stellar` (publishing
`latest: 2.21.0`, author field: Coinbase Inc.), `@modelcontextprotocol/sdk@1.30.0`.
Not yet checked: `zod`, `@playwright/test`, `@x402/core`, `@x402/hono`,
`@x402/fetch`, `@supabase/supabase-js`, `next`, `react`, `tailwindcss`,
`soroban-sdk` (crate), `stellar-xdr` (crate). These will be verified as each
is actually introduced in its phase (2, 3, 6, 7, 9), and a full re-verification
pass is required before submission per spec §11.

### GitHub Actions osv-scanner job — unverified call signature
`.github/workflows/ci.yml` calls
`google/osv-scanner-action/.github/workflows/osv-scanner-reusable.yml@v2.3.8`
as a reusable workflow. The tag (`v2.3.8`) was confirmed as the project's
latest release via the GitHub releases page, but the exact reusable-workflow
call signature could not be confirmed from the README in this session (the
fetched excerpt didn't include a literal example). The job is marked
`continue-on-error: true` until a real push to GitHub triggers it and the
call is confirmed to actually run. **Action needed:** first real CI run,
then remove `continue-on-error` once confirmed — per spec §6/§7 this is
meant to be a hard gate.

### External accounts not yet provisioned
These block later phases and require either credentials the assistant
doesn't have, or an outward-facing action (repo push, account creation) that
should be confirmed with the project owner first:
- **GitHub push** — `origin` is already configured
  (`https://github.com/Eras256/Periplo.git`), `gh` is authenticated, but
  nothing has been pushed yet. Local commits only until confirmed.
- **Supabase project** (Phase 2) — needed for the catalog Postgres instance,
  pgvector, RLS.
- **Fly.io apps** `periplo-testnet` / `periplo-mainnet` (Phase 10, staged
  earlier for Phase 3 deploys) — needed for hosted facilitator deployment.
- **Funded Stellar testnet keypairs** — a fee-sponsor key (Phase 3) and a
  separate conformance-harness key (Phase 8). Friendbot can fund a testnet
  account without a human in the loop; this can likely be self-served in
  Phase 3 rather than waiting on the project owner.
- **Matrix room + Mastodon/Bluesky account** (Phase 10) — genuine account
  creation, needs the project owner.
- **x402 e2e suite upstream registration** (Phase 8) — registering
  `e2e/facilitators/external-proxies/periplo/` means opening a PR against an
  external repo; needs owner sign-off before it's sent.
- **Audit Bank engagement** (Phase 10) — a program application, not something
  to submit unilaterally.

### `pnpm@11.20.0` genuinely requires Node ≥22.13 — not just a spec preference
Running `pnpm install` on this machine's original Node v20.19.6 crashed
outright (`ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` — pnpm 11's own store
resolver imports Node's built-in SQLite module, added in Node 22). This isn't
a style preference in the spec; pnpm 11.20.0 cannot run at all on Node <22.
**Resolved, not deferred:** `nvm` was already installed on this machine
(just not aliased/used yet). Installed Node 22.23.2 via `nvm install 22`,
set it as `nvm alias default 22`, and added `.nvmrc` (`22`) to the repo so
`nvm use` picks it up automatically in any properly-configured shell. The
one remaining friction: this harness's `Bash` tool starts a fresh, non-login
shell per call, so `nvm use` doesn't persist automatically between tool
calls within a session — each command that needs Node 22 currently sources
`~/.nvm/nvm.sh` and runs `nvm use 22` explicitly first. A real terminal
session (or a shell profile with `nvm use` wired to `.nvmrc` on `cd`, e.g.
via `avn` or a `.bashrc` hook) won't have this friction.

### `packages/licence-check` — production vs. build-tooling license scope
First real run of the gate against actual installed packages caught a live
case worth recording rather than silently special-casing: `vitest@4.1.10`
(pinned, spec §2) hard-depends on `vite@8.2.0`, which hard-depends on
`lightningcss` (and its platform binary `lightningcss-linux-x64-gnu`) —
both MPL-2.0, a copyleft-adjacent license `DENIED_PATTERNS` correctly flags.
This is unavoidable while using vitest as pinned; it is not optional or
prunable (confirmed: `lightningcss` is a plain `dependencies` entry in
vite's own `package.json`, not `optionalDependencies`).
**Design decision, not a policy weakening:** `packages/licence-check/src/cli.ts`
now runs the classifier twice — once scoped to `pnpm licenses list --prod`
(what a consumer actually installs and runs: "dependencies" +
"optionalDependencies") as the **hard, blocking gate**, and once over the
full graph (prod + dev + optional) to surface dev-only findings as
**warnings only**. Rationale: devDependencies are never bundled into a
deployed Periplo service, and MPL-2.0's actual obligation is file-level
(share modifications to *that* file if distributed) rather than viral onto
surrounding code — using it unmodified as a test/build tool doesn't create
the risk spec §1 is guarding against (a copyleft obligation reaching the
*operated* service or its self-hosted deployments). A strict AGPL/GPL/LGPL
hit would still warn the same way if it only appeared in devDependencies,
but the classifier itself (`classify.ts`) is unchanged and still denies
every copyleft family unconditionally when it's in the shipped graph —
verify with `pnpm licence-check` once Phase 3 adds real runtime
dependencies (`hono`, `@x402/stellar`, etc.), which is when this distinction
starts actually mattering.

## Phase 0 — scope not built (by design, not by omission)

Nothing in this category yet. Phase 0 as scoped (§5) is monorepo tooling +
baseline capture; both are complete for what's reachable without the
external accounts above.
