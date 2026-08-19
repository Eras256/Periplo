# TOOLING.md

Operational notes for whoever edits this repo with Claude Code: exact
commands, local environment quirks, and machine-specific setup. None of
this is architecture or a design decision, it's how to run things on this
machine. See [`CLAUDE.md`](../CLAUDE.md) for what the project is and why
it's built the way it is, and [`docs/DEFERRED.md`](DEFERRED.md) for
divergences between what `docs/SPEC.md` assumes about the environment and
what's actually here.

## Commands

Requires Node ≥22. `pnpm@11.20.0` (pinned) will not run on Node <22.13, it
imports the `node:sqlite` built-in. This machine's default shell Node is
20.19.6; switch first in every new shell:

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22
```

(`.nvmrc` pins `22`, but this harness starts a fresh non-login shell per
tool call, so nvm's automatic `.nvmrc` pickup doesn't persist between
commands, run the line above each time.)

```bash
pnpm install
pnpm typecheck        # tsc -b across all workspace packages (project references)
pnpm lint              # biome check .
pnpm lint:fix           # biome check --write .
pnpm test               # vitest run, workspace-wide
pnpm test:watch
pnpm licence-check      # AGPL/copyleft gate, see CLAUDE.md's non-negotiable constraints
pnpm run ci             # typecheck && lint && test && licence-check, in that order
```

**Use `pnpm run ci`, not bare `pnpm ci`.** `ci` is a reserved pnpm CLI
command (alias for `clean-install`: `pnpm clean` + `pnpm install
--frozen-lockfile`) that shadows a package.json script of the same name;
bare `pnpm ci` silently reinstalls dependencies instead of running the
gate, with no error pointing at the shadowing. `pnpm run ci` forces
package.json script resolution. Found empirically running this exact
command during Phase 4 (`pnpm help ci` confirms the alias); every
individual step (`typecheck`/`lint`/`test`/`licence-check`) was still run
and verified separately throughout Phases 0-3, so this was a misleading
shortcut, not a gap in what actually got checked.

Run a single test file: `pnpm exec vitest run path/to/file.test.ts`.

## Running the real integration suites locally

Supabase project and a Stellar testnet fee-sponsor account are both live
(provisioned mid-build, not self-hosted by this session). Credentials
live in a local, gitignored `.env` and in this repo's GitHub Actions
secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`STELLAR_FEE_SPONSOR_SECRET`, `STELLAR_FEE_SPONSOR_PUBLIC`), never in a
committed file. Run
`export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22` then
`pnpm test` locally to exercise the real integration suites in
`packages/bazaar/src/db/resources.integration.test.ts` and
`apps/facilitator/src/core.test.ts`; both skip themselves (not a failure)
when their env vars aren't set.

Real Stellar testnet test fixtures also exist for exercising a live
payment, not just `PTEST` (the self-issued token from Phase 3, since
Circle's faucet has no API): `STELLAR_TEST_BUYER_PUBLIC` now also holds
real testnet USDC with an established trustline
(`GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` is the real
issuer, read authoritatively off the SAC contract's own `name()` call,
not guessed). `apps/facilitator/scripts/settle-demo.ts` can target either
asset by env var.

## Redeploying apps/facilitator on Fly.io

Redeploy with
`fly deploy --config fly.facilitator.toml --dockerfile Dockerfile.facilitator -a periplo-testnet`
from the repo root; secrets are set via `fly secrets set -a periplo-testnet`,
never in `fly.facilitator.toml`. **The app lives under the
`ticketsafes@gmail.com` Fly account, not whatever account a given `fly`
CLI session happens to be logged into**: a session authenticated as a
different account gets `Error: unauthorized` on deploy and can't even see
`periplo-testnet` in `fly apps list`, found live, not assumed, when a
redeploy failed this way and was only fixed by switching accounts
(`docs/DEFERRED.md`). Verify with `fly auth whoami` /
`fly apps list` before assuming a deploy will work.

## Checking CI

`.github/workflows/ci.yml` silently failed to run at all from Phase 1
through Phase 3 (two stacked, independently-diagnosed causes: a malformed
reusable-workflow reference, then a private-repo Actions-minutes billing
block once that was fixed; full evidence in `docs/DEFERRED.md`), while
every phase's local `pnpm ci` was genuinely green the whole time. Check
`gh run list -R Eras256/Periplo` periodically; CI passing locally is not
the same claim as CI passing, don't assume CI mirrors the local gate.

## Environment notes specific to this machine

- `docs/DEFERRED.md` tracks every divergence found between what
  `docs/SPEC.md` assumes about the environment (tool versions, MCP server
  availability, skill pack contents) and what's actually here, plus how
  each was resolved. Check it before assuming a tool or credential isn't
  available, several things that looked missing on first inspection
  turned out to just need a different check (e.g. the `stellar-build`
  skill pack: `ls ~/.claude/skills/` undercounts it, invoke skills by name
  via the `Skill` tool instead of trusting that directory listing).
- `docs/SKILLS.md` maps which `stellar-build` skills actually exist in this
  environment to the phases in `docs/SPEC.md`.
- `docs/ECOSYSTEM.md` is a partial, dated snapshot of the competitive
  landscape (LumenLoop catalogue) used for differentiation framing, not
  live data, regenerate before relying on it for the actual submission.
- `docs/MEMORY.md` is the running, committed decision log for *why* things
  were built the way they were, append to it at every phase, alongside
  `docs/DEFERRED.md` for what wasn't built.
- An OpenAI Codex config exists at `~/.codex/config.toml` on this machine
  (user-level, not project-level). Not read or imported; if useful here,
  run `/import` interactively to review what it would bring in.
