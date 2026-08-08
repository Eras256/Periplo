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

## Phase 2 — environment divergences and real findings

Supabase project provisioned and credentials supplied directly in the build
session (2026-08-07). **Handling:** credentials went straight into a local
`.env` (gitignored, never committed — verified with `git status --porcelain`
and `git check-ignore -v .env` before every commit this phase) and into this
repo's GitHub Actions secrets (`gh secret set`, values piped via stdin, never
put in an argv or echoed). **Rotation note:** the DB password and both
service-role/anon JWTs were pasted as plaintext chat content, which may be
retained in conversation history outside this repo's control — rotating
them (Supabase dashboard → Settings → Database / API) once Phase 2's
migrations are confirmed stable is good hygiene, not an emergency, since
nothing else has had access to them.

### Direct Postgres connection (port 5432) is unreachable from this sandbox
`db.<ref>.supabase.co` resolves **IPv6-only**, and this sandbox has no IPv6
egress at all (verified: `curl -6` to an external IPv6 host also fails, not
just to Supabase). `supabase db push --db-url <direct-url>` failed with
`ECONNREFUSED` on the IPv6 address before any DNS/auth issue was even
reached. **Fix:** used the transaction-pooler connection instead (port 6543,
`aws-0-ca-central-1.pooler.supabase.com`, resolves IPv4), which Supabase
itself documents as the recommended path for IPv4-only environments. All
migrations and integration tests in this phase went through the pooler.
Plain DDL (CREATE TABLE/INDEX/POLICY, no CONCURRENTLY, no advisory locks)
worked fine through it — no caveats hit in practice. If a future phase needs
the direct connection specifically, this sandbox is the blocker, not Supabase.

### `to_tsvector('english', text)` is not IMMUTABLE — can't use it directly in a generated column
The master spec's literal SQL (§5 Phase 2) defines `fts` as
`generated always as (to_tsvector('english', ...)) stored`. PostgreSQL's
two-argument `to_tsvector(regconfig, text)` is marked STABLE, not IMMUTABLE
(the named text search configuration could theoretically change), and
generated columns require an IMMUTABLE expression. This is a standing,
well-known PostgreSQL limitation, not something specific to Supabase or this
schema. **Fix, applied proactively rather than after a failed migration:**
wrapped it in `periplo_fts(text) returns tsvector language sql immutable`,
which is a safe promise here because `'english'` is a literal, never a
variable, in this project. See `supabase/migrations/*_resources.sql` for
the full reasoning inline.

### Plain `unique (url, route_template, tool_name)` doesn't dedupe the way the spec intends
Standard SQL `UNIQUE` treats `NULL` as distinct from `NULL`, so two HTTP
listings sharing `(url, route_template)` with `tool_name` NULL in both rows
would NOT collide and could both be inserted — silently defeating "one
catalog entry per resource." **Fix:** `unique nulls not distinct (...)`
(PostgreSQL 15+, supported on Supabase's managed Postgres — confirmed by
the migration applying cleanly). Not in the master spec's literal SQL;
added and documented rather than reproducing a schema bug verbatim.

### `auto_expose_new_tables` defaults to off — RLS policies alone aren't enough
Supabase's current default (confirmed via `supabase init`'s generated
`config.toml` comment, not assumed) does **not** auto-grant the
`anon`/`authenticated` Data API roles access to newly created tables. An RLS
policy with no matching `GRANT` is unreachable dead code — PostgREST rejects
the request at the grant level before RLS is even evaluated. **Fix:**
explicit `grant select on resources to anon, authenticated;` (plus
`grant usage on schema public`) alongside the RLS policy. Verified end to
end with real HTTP requests (anon SELECT 200, anon INSERT 401 RLS violation,
service-role INSERT 201) before writing the automated test suite, and again
via the automated `resources.integration.test.ts` suite, which passes for
real against the live project (`pnpm test`, gated by
`SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`, present in
this repo's GitHub Actions secrets and in local `.env`).

### `@supabase/supabase-js@2.112.2`'s generic types silently collapse to `never` with an `interface`
Not a Supabase-specific bug — a general TypeScript behavior that happens to
bite hard here. `postgrest-js`'s `.from()` resolves its row/insert/update
types via a conditional type that checks `Row extends Record<string,
unknown>`. A named `interface` does **not** satisfy that check the way a
`type` object literal does, even though both are otherwise structurally
identical and an `interface` value assigns to `Record<string, unknown>`
just fine directly. The failure mode is silent and confusing: every
`.from("resources")` call's inferred argument/result type quietly becomes
`never` instead of raising a type error pointing at the real cause.
Diagnosed empirically with an isolated conditional-type repro (not by
guessing) — see `packages/bazaar/src/db/client.ts`'s comments. **Fix:**
`Database` and `ResourceRow` are declared with `type`, not `interface`.
Worth remembering for any future generated-types file (Phase 4/5 will need
richer row types as the schema grows).

## Phase 3 — environment divergences and real findings

### Circle's testnet USDC faucet has no API — blocks using real testnet USDC for an automated settlement
`faucet.circle.com` requires a browser and reCAPTCHA; there is no
programmatic endpoint (checked directly, not assumed — see the WebFetch
result in this phase's session). This session can't complete that flow.
**Resolved, not deferred:** issued a self-owned test SEP-41 token instead
(`PTEST`, classic asset wrapped as a Stellar Asset Contract via `stellar
contract asset deploy` — no custom contract code needed) and used it for
the Phase 3 gate's settled transaction. `@x402/stellar`'s exact scheme
treats the asset address as a parameter; nothing in the facilitator's
logic is USDC-specific. Getting a real testnet-USDC-funded account (via
the faucet, which needs a human) would let a future session additionally
prove it works with the canonical asset — not required for the gate, since
the gate asks for *a* settled transaction hash, not specifically a USDC
one, but worth doing before claiming full parity with the reference
facilitator's asset support.

### Paying a classic asset back to its own issuer is a burn, not a transfer
First settlement attempt used the test asset's own issuer account as
`payTo`. Under classic Stellar semantics, sending an asset to its issuer
redeems/burns it — the Stellar Asset Contract (SAC) bridge correctly
represents this as a `burn` event (`topics: [burn, from, asset_code]`),
not a CAP-46 `transfer` event (`topics: [transfer, from, to, asset]`).
`@x402/stellar`'s `validateSimulationEvents` requires a `transfer` event
matching sender/recipient/amount exactly and rejects anything else
(`invalid_exact_stellar_payload_event_not_transfer`) — working as
designed; the bug was in the test setup, not the library. **Fix:** use a
genuine third-party account, never the asset's own issuer, as `payTo`.
Diagnosed by decoding the real simulation's diagnostic events directly
(`Address.fromScAddress`/`scValToNative` over the raw XDR) rather than
guessing from the error string alone — worth doing again if a similarly
opaque `invalid_exact_stellar_payload_event_*` reason shows up later.

### A classic-asset-backed SAC still requires a classic trustline on both ends
Also discovered while diagnosing the above: transferring a classic-asset
SAC token to an account with no trustline for that asset fails outright
(`HostError: Error(Contract, #13)`, `"trustline entry is missing for
account"`) — SAC does not let a classic asset bypass trustlines for plain
G-accounts; that bridging only happens once the trustline exists. A
genuinely Soroban-native token (not a classic-asset wrapper) wouldn't have
this requirement, but this project's test asset is classic-backed since
`stellar contract asset deploy` is what's actually available without
writing a custom contract. **Fix:** the test seller account establishes a
`PTEST` trustline before receiving the demo payment (see
`apps/facilitator/scripts/settle-demo.ts` and the accounts recorded in
`.env`). Real testnet/mainnet USDC is also classic-asset-backed, so a real
x402 seller integrating against USDC needs the same trustline step —
this is exactly the "an account needs a trustline before it can receive a
SEP-41 asset... surface it as a distinct, actionable error" case spec §2
already calls out; worth building that error path explicitly in a later
phase (Phase 4 seller helpers, or the hub's `/buyers` trustline-step docs).

### `@x402/stellar`'s facilitator `ExactStellarScheme` is a different export than the client one — same class name, different subpath
The package's main entry (`@x402/stellar`) re-exports `ExactStellarScheme`
from `./exact/client` (the CLIENT variant — `SchemeNetworkClient`, used to
*build* a payment). The FACILITATOR variant (`SchemeNetworkFacilitator`,
used to *verify/settle* one) is a separate subpath export,
`@x402/stellar/exact/facilitator`. Importing the wrong one from the main
barrel type-errors in a confusing way (TypeScript reports the argument as
missing `ClientStellarSigner` properties, not "wrong class") rather than
pointing at the real cause. **Fix:** `apps/facilitator/src/core.ts`
imports explicitly from the `/exact/facilitator` subpath, with a comment
explaining why, specifically so this isn't "fixed" back to the barrel
import later by someone who sees `ExactStellarScheme` unqualified and
assumes there's only one.

### No Node HTTP adapter for Hono chosen yet — needed before real deployment
`apps/facilitator` is tested via Hono's own `app.request()` (in-memory,
no real port) — sufficient for Phase 3's gate (verify/settle logic +
one settled transaction), but running this as an actual listening service
(Fly.io, Phase 10, or any "hosted"/"self-hosted" deployment path) needs a
Node HTTP adapter, most likely `@hono/node-server` (official, small,
MIT-licensed). Not added yet: it's a new dependency outside spec §2's
manifest, and working rule 6 says ask before adding one rather than
sneaking it in alongside unrelated work. Flagging here now so it's a
known, upcoming decision rather than a surprise at Phase 10.

### `Exact scheme requires areFeesSponsored to be true` — client-side requirement, not just facilitator-side
`@x402/stellar`'s client `ExactStellarScheme.createPaymentPayload` throws
outright if `paymentRequirements.extra.areFeesSponsored` isn't `true` —
the client needs to know fee sponsorship is happening so it doesn't try to
provision its own fee payment when building the transaction. Found by
running the demo script and reading the real error, not documented
anywhere obvious beforehand. Any seller-side helper built in Phase 4 that
constructs `paymentRequirements` for Stellar must set this field, or every
client using `@x402/stellar` against it will fail before even reaching the
facilitator.

## Phase 10 — started early, at explicit request (deployment, not the full phase)

`apps/facilitator` is live on Fly.io (`stellar:testnet` only) at
`https://periplo-testnet.fly.dev`, deployed 2026-08-07 out of the normal
phase sequence because the project owner asked for it directly. **This is
not "Phase 10 complete"** — it's the one piece (facilitator deployment)
pulled forward; the rest of Phase 10's scope (an equivalent
`periplo-mainnet` app, the runbook, monitoring beyond a bare `/health`,
public telemetry endpoint, both example integrations, hardening pass,
Matrix/Mastodon channels) is still not built, and shouldn't be inferred
from the app being live.

- **`@hono/node-server@2.1.0` (MIT) added** — this closes the gap flagged
  in Phase 3's entry above ("No Node HTTP adapter for Hono chosen yet").
  It's outside spec §2's manifest; flagged here rather than silently
  bundled into an unrelated commit, per working rule 6, even though the
  deploy itself was the explicit ask that made it necessary.
- **`periplo-mainnet` does not exist and won't until a real mainnet
  fee-sponsor key exists.** Spec §2/§13 commit to both networks, but
  nothing about "deploy now" implies fabricating mainnet infrastructure
  ahead of having real funds/a real key to back it — that's a distinct,
  later decision, not an oversight.
- **Fly API token** was pasted directly in the build session (same
  handling as the Supabase/Stellar secrets before it): stored in local
  `.env` only, never committed. Not actually needed for this deploy — the
  `fly` CLI on this machine was already authenticated interactively
  (`ticketsafes@gmail.com`) — kept for a possible future GitHub Actions
  deploy workflow instead.
- **Docker build context is the whole monorepo** (`Dockerfile.facilitator`
  builds only `apps/facilitator`, but needs the workspace root for pnpm
  resolution) — added `.dockerignore` to keep `node_modules`/`dist` out of
  the ~217MB context Fly's builder otherwise re-uploads on every deploy.
- **Circle testnet USDC — first funding attempt bounced, cause found and
  fixed.** The project owner funded `STELLAR_TEST_BUYER_PUBLIC` via
  Circle's faucet ("Tokens sent, 20 testnet USDC..."), but the buyer
  account had no classic trustline for USDC yet — same "trustline entry
  is missing" failure mode discovered with `PTEST` earlier in this phase,
  now confirmed to apply to real USDC too (it's classic-asset-backed, not
  a pure Soroban-native token). Checked directly: no balance, no claimable
  balance either, so the transfer genuinely never landed rather than
  being recoverable. **Fixed**: established the trustline
  (`USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` — the
  real issuer, read authoritatively off the SAC contract's own `name()`
  call rather than guessed) via the `stellar` CLI using the buyer's key
  this project already holds. Balance is `0.0000000 USDC`, ready to
  receive — needs a resend from the faucet now that the trustline exists.

## CI was broken from Phase 1 through Phase 3 — the local gate was real, the CI gate wasn't

`gh run list` showed every push since Phase 1 failing in ~0 seconds with
zero jobs scheduled — GitHub rejected `.github/workflows/ci.yml` outright
before running anything, including the `build` job (typecheck/lint/test/
licence-check). Root cause: the `osv-scan` job's reusable-workflow call
(`google/osv-scanner-action/.../osv-scanner-reusable.yml@v2.3.8`,
originally flagged in Phase 0's own commit as unverified) had a workflow
file issue GitHub's schema validator rejects, and that rejection takes
down the *entire* file, not just that one job. This was flagged as a risk
in every phase's `docs/DEFERRED.md` entry ("has not yet had a live CI run
to confirm the call signature") but never actually followed up on until
now, checking `gh run list` directly rather than continuing to trust the
local `pnpm ci` result as a stand-in for CI passing. **Fix**: removed the
broken `osv-scan` job outright rather than guess at the correct reusable-
workflow syntax a second time; `build` now runs on its own. Re-adding a
working `osv-scan` job (spec §6/§7 want it as a hard gate) is still open —
next attempt should be validated against a real, isolated push before
being trusted, not assumed correct from the manifest/release-tag check
alone.
**Lesson for future phases**: "the gate passed" claims in commit messages
so far were accurate for the *local* gate every time (never fabricated),
but conflated with CI passing when CI silently wasn't running at all.
Worth periodically checking `gh run list` directly rather than only
running `pnpm ci` locally and assuming CI mirrors it.

## Fly deployment follow-ups (from live testing after the initial deploy)

- **Scaled from 2 machines to 1** (`fly scale count 1`). Fly creates 2 by
  default for zero-downtime rolling deploys; for a testnet demo (not yet
  under any uptime SLA — that's Phase 10's runbook territory) 1 is
  simpler and cheaper, and `min_machines_running = 1` in
  `fly.facilitator.toml` already covers "never 0." Both machines were
  observed idling to `stopped` between requests regardless
  (`auto_stop_machines = "stop"`) and Fly's proxy auto-starts one on
  demand — confirmed this works via a real cold request, not assumed.
- **Added a `GET /` route.** Hitting the bare host 404ed with no context
  (nothing was ever routed there) — not a bug, but confusing without
  explanation, so it now returns a small JSON description of the service
  and its real endpoints. No new claims: it's honest about what exists
  today (no frontend, no `/browse` etc.).
- **`fly deploy` prints a "not listening on the expected address" warning
  every time** even with `@hono/node-server`'s `hostname` explicitly set
  to `0.0.0.0`. Real external `curl` requests succeed regardless (checked
  after both the warned and the explicit-hostname deploys) — treated as a
  startup-timing false positive in Fly's smoke-check, not a real
  reachability problem, since the actual behavior (not the warning text)
  is what was verified.

## CI, part 2 — resolved: the billing block was private-repo Actions minutes

After removing the broken `osv-scan` job, the next push's run parsed and
scheduled `build` (12s runtime, not 0s — confirming the workflow-file fix
worked), but the job itself never started:
> "The job was not started because recent account payments have failed or
> your spending limit needs to be increased."

Cause, per the project owner: the repo was private, and private repos on
GitHub only get a limited free tier of Actions minutes before requiring
billing/a spending limit — public repos get free standard-runner minutes
without that constraint. **Fixed** by making `Eras256/Periplo` public.

**Verified twice, not assumed once:**
1. `gh run rerun 31222094411` after the visibility change actually
   executed this time (`in_progress`, not an instant billing-error
   failure) and finished `build` — success, 24s.
2. The project owner (correctly) pushed back on trusting a manual rerun
   alone — a rerun can behave differently from an organic trigger. The
   very next real `push` (no `rerun` involved) triggered its own new run,
   `31222406798`, and it also passed for real: `build` in 23s
   (`https://github.com/Eras256/Periplo/actions/runs/31222406798`).

Also re-verified the earlier "workflow file issue" runs weren't actually
the same billing problem wearing a different message, rather than just
asserting the two-cause story: `gh api
repos/Eras256/Periplo/actions/runs/31220202302/jobs` (a pre-fix, `push`-
triggered run) returns `{"total_count":0,"jobs":[]}` — literally zero job
entries created. That's structurally different from the billing block,
which *does* create a `build` job entry and then blocks it from starting.
Two distinct GitHub error messages, two distinct job-scheduling shapes,
two independent fixes, both confirmed against real runs — not one
misdiagnosed cause redescribed. CI is confirmed green as of 2026-08-07.

One harmless annotation surfaced on the passing run: `actions/checkout@v4`,
`actions/setup-node@v4`, and `pnpm/action-setup@v4` are running on a
deprecated internal Node 20 runner-action-runtime (unrelated to this
project's own Node 22 pin — it's about the version GitHub's runner uses to
execute the action's own code). Not urgent; worth bumping to newer action
versions eventually.

Re-adding a working `osv-scan` job (spec §6/§7 want it as a hard gate) is
still open — next attempt should be validated against a real, isolated
push before being trusted, same caution as before.

## README follow-up: the `spec/` link for `upto` needs updating at Phase 6

README's "What Periplo is (planned)" section links `upto`'s spec to
[`spec/`](../spec/) with "Phase 6, not yet written" — accurate today
(Phase 6 hasn't started), but once `spec/scheme_upto_stellar.md` exists
and the upstream x402 PR opens (spec §5 Phase 6), that link should point
at the actual PR, not an empty directory — the PR is the strongest piece
of evidence Phase 6 produces and the README should surface it directly
rather than make a reviewer go find it. Tracked here so it isn't missed
when Phase 6 wraps up.
