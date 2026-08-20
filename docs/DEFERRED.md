# Deferred: everything deliberately not built (yet), and why

Per master spec §12 rule 5: "When blocked, write the blocker here and continue
with everything that does not depend on it." This file is a running log, not
a one-time snapshot. Update it every phase.

## Phase 0: environment divergences from the spec's assumptions

The spec was written assuming a specific machine setup. This session's actual
environment differs in a few concrete ways. None of these blocked Phase 0;
they're recorded here because later phases depend on closing them.

### Raven MCP: added, not yet authenticated
`stellar-raven` was not connected at session start. It has now been added
(`claude mcp add --transport http stellar-raven "https://raven.stellar.buzz/mcp"`),
but `claude mcp list` reports `! Needs authentication`, and this session is
non-interactive: no browser is available to complete an OAuth-style sign-in.
The harness's own note on `claude.ai` connectors covers the same limitation.
**Substitute used for Phase 0:** direct `WebFetch`/`curl` against the npm
registry, crates.io-equivalent checks, and live endpoints (x402.org
facilitator, developers.stellar.org), plus the `standards` skill's bundled
ecosystem reference. This produced verifiable, cited results (see
`conformance/baseline/`) but is slower than a single Raven `search`/`execute`
call would be. **Action needed:** whoever runs the next session should
complete the Raven sign-in interactively so later phases (especially 3, 6,
where live protocol/RPC semantics matter) can use it directly.

### The 45-skill `stellar-build` pack: present, just not where expected
`ls ~/.claude/skills/` only shows 13 symlinked skills. The fuller pack named
in the spec (`standards`, `agentic-payments`, `assets`, `dapp`,
`smart-contracts`, `tyler-architect`, `deploy-stellar-mainnet`,
`review-edge-case-hunter`, etc.) turned out to be real and available via the
`Skill` tool regardless, confirmed by invoking `standards` directly. Initial
assessment based on the symlink directory alone was wrong; noted here so the
correction is on record rather than silently discarded.

### Local Node / pnpm version drift
The spec pins Node ≥22 and `pnpm@11.20.0` (§2). This machine's preinstalled
toolchain is Node v20.19.6 and pnpm 10.30.3, with no `nvm`/`volta`/`fnm`
available to switch versions locally. Both pinned versions were confirmed to
exist on the npm registry (verified live, 2026-08-07), so the pins themselves
are correct. The gap is local-only.
**Handling:** `.github/workflows/ci.yml` pins Node 22 + pnpm 11.20.0 via
`actions/setup-node` and `pnpm/action-setup`, so the real gate (CI) runs on
the correct toolchain. `.npmrc` sets `engine-strict=false` so the *local* dev
loop on this machine doesn't hard-fail on the engines mismatch. Recommend
installing `nvm` (or similar) and running `nvm install 22` before Phase 3
onward, where runtime behaviour differences between Node 20 and 22 become
more likely to matter (native fetch/undici versions, etc.).

### §2 manifest: verification status
Only the packages actually wired into Phase 0 tooling were checked live
against the npm registry so far, all confirmed present at the pinned version
on 2026-08-07: `typescript@7.0.2`, `vitest@4.1.10`, `@biomejs/biome@2.5.7`,
`tsx@4.23.9` (registry `latest` has since moved to 4.23.10, the pin is still
valid, just not `latest` anymore), `@types/node@26.1.2`, `pnpm@11.20.0`,
`hono@4.13.0`, `@stellar/stellar-sdk@16.2.0`, `@x402/stellar` (publishing
`latest: 2.21.0`, author field: Coinbase Inc.), `@modelcontextprotocol/sdk@1.30.0`.
Not yet checked: `zod`, `@playwright/test`, `@x402/core`, `@x402/hono`,
`@x402/fetch`, `@supabase/supabase-js`, `next`, `react`, `tailwindcss`,
`soroban-sdk` (crate), `stellar-xdr` (crate). These will be verified as each
is actually introduced in its phase (2, 3, 6, 7, 9), and a full re-verification
pass is required before submission per spec §11.

### GitHub Actions osv-scanner job: unverified call signature
`.github/workflows/ci.yml` calls
`google/osv-scanner-action/.github/workflows/osv-scanner-reusable.yml@v2.3.8`
as a reusable workflow. The tag (`v2.3.8`) was confirmed as the project's
latest release via the GitHub releases page, but the exact reusable-workflow
call signature could not be confirmed from the README in this session (the
fetched excerpt didn't include a literal example). The job is marked
`continue-on-error: true` until a real push to GitHub triggers it and the
call is confirmed to actually run. **Action needed:** first real CI run,
then remove `continue-on-error` once confirmed. Per spec §6/§7 this is
meant to be a hard gate.

### External accounts not yet provisioned
These block later phases and require either credentials the assistant
doesn't have, or an outward-facing action (repo push, account creation) that
should be confirmed with the project owner first:
- **GitHub push**: `origin` is already configured
  (`https://github.com/Eras256/Periplo.git`), `gh` is authenticated, but
  nothing has been pushed yet. Local commits only until confirmed.
- **Supabase project** (Phase 2): needed for the catalog Postgres instance,
  pgvector, RLS.
- **Fly.io apps** `periplo-testnet` / `periplo-mainnet` (Phase 10, staged
  earlier for Phase 3 deploys): needed for hosted facilitator deployment.
- **Funded Stellar testnet keypairs**: a fee-sponsor key (Phase 3) and a
  separate conformance-harness key (Phase 8). Friendbot can fund a testnet
  account without a human in the loop; this can likely be self-served in
  Phase 3 rather than waiting on the project owner.
- **Matrix room + Mastodon/Bluesky account** (Phase 10): genuine account
  creation, needs the project owner.
- **x402 e2e suite upstream registration** (Phase 8): registering
  `e2e/facilitators/external-proxies/periplo/` means opening a PR against an
  external repo; needs owner sign-off before it's sent.
- **Audit Bank engagement** (Phase 10): a program application, not something
  to submit unilaterally.

### `pnpm@11.20.0` genuinely requires Node ≥22.13, not just a spec preference
Running `pnpm install` on this machine's original Node v20.19.6 crashed
outright (`ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`, pnpm 11's own store
resolver imports Node's built-in SQLite module, added in Node 22). This isn't
a style preference in the spec; pnpm 11.20.0 cannot run at all on Node <22.
**Resolved, not deferred:** `nvm` was already installed on this machine
(just not aliased/used yet). Installed Node 22.23.2 via `nvm install 22`,
set it as `nvm alias default 22`, and added `.nvmrc` (`22`) to the repo so
`nvm use` picks it up automatically in any properly-configured shell. The
one remaining friction: this harness's `Bash` tool starts a fresh, non-login
shell per call, so `nvm use` doesn't persist automatically between tool
calls within a session. Each command that needs Node 22 currently sources
`~/.nvm/nvm.sh` and runs `nvm use 22` explicitly first. A real terminal
session (or a shell profile with `nvm use` wired to `.nvmrc` on `cd`, e.g.
via `avn` or a `.bashrc` hook) won't have this friction.

### `packages/licence-check`: production vs. build-tooling license scope
First real run of the gate against actual installed packages caught a live
case worth recording rather than silently special-casing: `vitest@4.1.10`
(pinned, spec §2) hard-depends on `vite@8.2.0`, which hard-depends on
`lightningcss` (and its platform binary `lightningcss-linux-x64-gnu`), both
MPL-2.0, a copyleft-adjacent license `DENIED_PATTERNS` correctly flags.
This is unavoidable while using vitest as pinned; it is not optional or
prunable (confirmed: `lightningcss` is a plain `dependencies` entry in
vite's own `package.json`, not `optionalDependencies`).
**Design decision, not a policy weakening:** `packages/licence-check/src/cli.ts`
now runs the classifier twice: once scoped to `pnpm licenses list --prod`
(what a consumer actually installs and runs: "dependencies" +
"optionalDependencies") as the **hard, blocking gate**, and once over the
full graph (prod + dev + optional) to surface dev-only findings as
**warnings only**. Rationale: devDependencies are never bundled into a
deployed Periplo service, and MPL-2.0's actual obligation is file-level
(share modifications to *that* file if distributed) rather than viral onto
surrounding code. Using it unmodified as a test/build tool doesn't create
the risk spec §1 is guarding against (a copyleft obligation reaching the
*operated* service or its self-hosted deployments). A strict AGPL/GPL/LGPL
hit would still warn the same way if it only appeared in devDependencies,
but the classifier itself (`classify.ts`) is unchanged and still denies
every copyleft family unconditionally when it's in the shipped graph.
Verify with `pnpm licence-check` once Phase 3 adds real runtime
dependencies (`hono`, `@x402/stellar`, etc.), which is when this distinction
starts actually mattering.

## Phase 0: scope not built (by design, not by omission)

Nothing in this category yet. Phase 0 as scoped (§5) is monorepo tooling +
baseline capture; both are complete for what's reachable without the
external accounts above.

## Phase 2: environment divergences and real findings

Supabase project provisioned and credentials supplied directly in the build
session (2026-08-07). **Handling:** credentials went straight into a local
`.env` (gitignored, never committed, verified with `git status --porcelain`
and `git check-ignore -v .env` before every commit this phase) and into this
repo's GitHub Actions secrets (`gh secret set`, values piped via stdin, never
put in an argv or echoed). **Rotation note:** the DB password and both
service-role/anon JWTs were pasted as plaintext chat content, which may be
retained in conversation history outside this repo's control. Rotating
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
worked fine through it, no caveats hit in practice. If a future phase needs
the direct connection specifically, this sandbox is the blocker, not Supabase.

### `to_tsvector('english', text)` is not IMMUTABLE: can't use it directly in a generated column
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
would NOT collide and could both be inserted, silently defeating "one
catalog entry per resource." **Fix:** `unique nulls not distinct (...)`
(PostgreSQL 15+, supported on Supabase's managed Postgres, confirmed by
the migration applying cleanly). Not in the master spec's literal SQL;
added and documented rather than reproducing a schema bug verbatim.

### `auto_expose_new_tables` defaults to off: RLS policies alone aren't enough
Supabase's current default (confirmed via `supabase init`'s generated
`config.toml` comment, not assumed) does **not** auto-grant the
`anon`/`authenticated` Data API roles access to newly created tables. An RLS
policy with no matching `GRANT` is unreachable dead code, PostgREST rejects
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
Not a Supabase-specific bug, a general TypeScript behavior that happens to
bite hard here. `postgrest-js`'s `.from()` resolves its row/insert/update
types via a conditional type that checks `Row extends Record<string,
unknown>`. A named `interface` does **not** satisfy that check the way a
`type` object literal does, even though both are otherwise structurally
identical and an `interface` value assigns to `Record<string, unknown>`
just fine directly. The failure mode is silent and confusing: every
`.from("resources")` call's inferred argument/result type quietly becomes
`never` instead of raising a type error pointing at the real cause.
Diagnosed empirically with an isolated conditional-type repro, not by
guessing. See `packages/bazaar/src/db/client.ts`'s comments. **Fix:**
`Database` and `ResourceRow` are declared with `type`, not `interface`.
Worth remembering for any future generated-types file (Phase 4/5 will need
richer row types as the schema grows).

## Phase 3: environment divergences and real findings

### Circle's testnet USDC faucet has no API: blocks using real testnet USDC for an automated settlement
`faucet.circle.com` requires a browser and reCAPTCHA; there is no
programmatic endpoint (checked directly, not assumed, see the WebFetch
result in this phase's session). This session can't complete that flow.
**Resolved, not deferred:** issued a self-owned test SEP-41 token instead
(`PTEST`, classic asset wrapped as a Stellar Asset Contract via `stellar
contract asset deploy`, no custom contract code needed) and used it for
the Phase 3 gate's settled transaction. `@x402/stellar`'s exact scheme
treats the asset address as a parameter; nothing in the facilitator's
logic is USDC-specific. Getting a real testnet-USDC-funded account (via
the faucet, which needs a human) would let a future session additionally
prove it works with the canonical asset. Not required for the gate, since
the gate asks for *a* settled transaction hash, not specifically a USDC
one, but worth doing before claiming full parity with the reference
facilitator's asset support.

### Paying a classic asset back to its own issuer is a burn, not a transfer
First settlement attempt used the test asset's own issuer account as
`payTo`. Under classic Stellar semantics, sending an asset to its issuer
redeems/burns it. The Stellar Asset Contract (SAC) bridge correctly
represents this as a `burn` event (`topics: [burn, from, asset_code]`),
not a CAP-46 `transfer` event (`topics: [transfer, from, to, asset]`).
`@x402/stellar`'s `validateSimulationEvents` requires a `transfer` event
matching sender/recipient/amount exactly and rejects anything else
(`invalid_exact_stellar_payload_event_not_transfer`), working as
designed; the bug was in the test setup, not the library. **Fix:** use a
genuine third-party account, never the asset's own issuer, as `payTo`.
Diagnosed by decoding the real simulation's diagnostic events directly
(`Address.fromScAddress`/`scValToNative` over the raw XDR) rather than
guessing from the error string alone, worth doing again if a similarly
opaque `invalid_exact_stellar_payload_event_*` reason shows up later.

### A classic-asset-backed SAC still requires a classic trustline on both ends
Also discovered while diagnosing the above: transferring a classic-asset
SAC token to an account with no trustline for that asset fails outright
(`HostError: Error(Contract, #13)`, `"trustline entry is missing for
account"`). SAC does not let a classic asset bypass trustlines for plain
G-accounts; that bridging only happens once the trustline exists. A
genuinely Soroban-native token (not a classic-asset wrapper) wouldn't have
this requirement, but this project's test asset is classic-backed since
`stellar contract asset deploy` is what's actually available without
writing a custom contract. **Fix:** the test seller account establishes a
`PTEST` trustline before receiving the demo payment (see
`apps/facilitator/scripts/settle-demo.ts` and the accounts recorded in
`.env`). Real testnet/mainnet USDC is also classic-asset-backed, so a real
x402 seller integrating against USDC needs the same trustline step. This
is exactly the "an account needs a trustline before it can receive a
SEP-41 asset... surface it as a distinct, actionable error" case spec §2
already calls out; worth building that error path explicitly in a later
phase (Phase 4 seller helpers, or the hub's `/buyers` trustline-step docs).

### `@x402/stellar`'s facilitator `ExactStellarScheme` is a different export than the client one: same class name, different subpath
The package's main entry (`@x402/stellar`) re-exports `ExactStellarScheme`
from `./exact/client` (the CLIENT variant, `SchemeNetworkClient`, used to
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

### No Node HTTP adapter for Hono chosen yet: needed before real deployment
`apps/facilitator` is tested via Hono's own `app.request()` (in-memory,
no real port), sufficient for Phase 3's gate (verify/settle logic +
one settled transaction), but running this as an actual listening service
(Fly.io, Phase 10, or any "hosted"/"self-hosted" deployment path) needs a
Node HTTP adapter, most likely `@hono/node-server` (official, small,
MIT-licensed). Not added yet: it's a new dependency outside spec §2's
manifest, and working rule 6 says ask before adding one rather than
sneaking it in alongside unrelated work. Flagging here now so it's a
known, upcoming decision rather than a surprise at Phase 10.

### `Exact scheme requires areFeesSponsored to be true`: client-side requirement, not just facilitator-side
`@x402/stellar`'s client `ExactStellarScheme.createPaymentPayload` throws
outright if `paymentRequirements.extra.areFeesSponsored` isn't `true`.
The client needs to know fee sponsorship is happening so it doesn't try to
provision its own fee payment when building the transaction. Found by
running the demo script and reading the real error, not documented
anywhere obvious beforehand. Any seller-side helper built in Phase 4 that
constructs `paymentRequirements` for Stellar must set this field, or every
client using `@x402/stellar` against it will fail before even reaching the
facilitator.

## Phase 10: started early, at explicit request (deployment, not the full phase)

`apps/facilitator` is live on Fly.io (`stellar:testnet` only) at
`https://periplo-testnet.fly.dev`, deployed 2026-08-07 out of the normal
phase sequence because the project owner asked for it directly. **This is
not "Phase 10 complete"**: it's the one piece (facilitator deployment)
pulled forward; the rest of Phase 10's scope (an equivalent
`periplo-mainnet` app, the runbook, monitoring beyond a bare `/health`,
public telemetry endpoint, both example integrations, hardening pass,
Matrix/Mastodon channels) is still not built, and shouldn't be inferred
from the app being live.

- **`@hono/node-server@2.1.0` (MIT) added.** This closes the gap flagged
  in Phase 3's entry above ("No Node HTTP adapter for Hono chosen yet").
  It's outside spec §2's manifest; flagged here rather than silently
  bundled into an unrelated commit, per working rule 6, even though the
  deploy itself was the explicit ask that made it necessary.
- **`periplo-mainnet` does not exist and won't until a real mainnet
  fee-sponsor key exists.** Spec §2/§13 commit to both networks, but
  nothing about "deploy now" implies fabricating mainnet infrastructure
  ahead of having real funds/a real key to back it. That's a distinct,
  later decision, not an oversight.
- **Fly API token** was pasted directly in the build session (same
  handling as the Supabase/Stellar secrets before it): stored in local
  `.env` only, never committed. Not actually needed for this deploy: the
  `fly` CLI on this machine was already authenticated interactively
  (`ticketsafes@gmail.com`), kept for a possible future GitHub Actions
  deploy workflow instead.
- **Docker build context is the whole monorepo** (`Dockerfile.facilitator`
  builds only `apps/facilitator`, but needs the workspace root for pnpm
  resolution). Added `.dockerignore` to keep `node_modules`/`dist` out of
  the ~217MB context Fly's builder otherwise re-uploads on every deploy.
- **Circle testnet USDC: first funding attempt bounced, cause found and
  fixed.** The project owner funded `STELLAR_TEST_BUYER_PUBLIC` via
  Circle's faucet ("Tokens sent, 20 testnet USDC..."), but the buyer
  account had no classic trustline for USDC yet, same "trustline entry
  is missing" failure mode discovered with `PTEST` earlier in this phase,
  now confirmed to apply to real USDC too (it's classic-asset-backed, not
  a pure Soroban-native token). Checked directly: no balance, no claimable
  balance either, so the transfer genuinely never landed rather than
  being recoverable. **Fixed**: established the trustline
  (`USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`, the
  real issuer, read authoritatively off the SAC contract's own `name()`
  call rather than guessed) via the `stellar` CLI using the buyer's key
  this project already holds. Balance is `0.0000000 USDC`, ready to
  receive, needs a resend from the faucet now that the trustline exists.

## CI was broken from Phase 1 through Phase 3: the local gate was real, the CI gate wasn't

`gh run list` showed every push since Phase 1 failing in ~0 seconds with
zero jobs scheduled. GitHub rejected `.github/workflows/ci.yml` outright
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
working `osv-scan` job (spec §6/§7 want it as a hard gate) is still open;
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
  under any uptime SLA, that's Phase 10's runbook territory) 1 is
  simpler and cheaper, and `min_machines_running = 1` in
  `fly.facilitator.toml` already covers "never 0." Both machines were
  observed idling to `stopped` between requests regardless
  (`auto_stop_machines = "stop"`) and Fly's proxy auto-starts one on
  demand, confirmed this works via a real cold request, not assumed.
- **Added a `GET /` route.** Hitting the bare host 404ed with no context
  (nothing was ever routed there), not a bug, but confusing without
  explanation, so it now returns a small JSON description of the service
  and its real endpoints. No new claims: it's honest about what exists
  today (no frontend, no `/browse` etc.).
- **`fly deploy` prints a "not listening on the expected address" warning
  every time** even with `@hono/node-server`'s `hostname` explicitly set
  to `0.0.0.0`. Real external `curl` requests succeed regardless (checked
  after both the warned and the explicit-hostname deploys), treated as a
  startup-timing false positive in Fly's smoke-check, not a real
  reachability problem, since the actual behavior (not the warning text)
  is what was verified.

## CI, part 2: resolved. The billing block was private-repo Actions minutes

After removing the broken `osv-scan` job, the next push's run parsed and
scheduled `build` (12s runtime, not 0s, confirming the workflow-file fix
worked), but the job itself never started:
> "The job was not started because recent account payments have failed or
> your spending limit needs to be increased."

Cause, per the project owner: the repo was private, and private repos on
GitHub only get a limited free tier of Actions minutes before requiring
billing/a spending limit; public repos get free standard-runner minutes
without that constraint. **Fixed** by making `Eras256/Periplo` public.

**Verified twice, not assumed once:**
1. `gh run rerun 31222094411` after the visibility change actually
   executed this time (`in_progress`, not an instant billing-error
   failure) and finished `build`, success, 24s.
2. The project owner (correctly) pushed back on trusting a manual rerun
   alone, a rerun can behave differently from an organic trigger. The
   very next real `push` (no `rerun` involved) triggered its own new run,
   `31222406798`, and it also passed for real: `build` in 23s
   (`https://github.com/Eras256/Periplo/actions/runs/31222406798`).

Also re-verified the earlier "workflow file issue" runs weren't actually
the same billing problem wearing a different message, rather than just
asserting the two-cause story: `gh api
repos/Eras256/Periplo/actions/runs/31220202302/jobs` (a pre-fix, `push`-
triggered run) returns `{"total_count":0,"jobs":[]}`, literally zero job
entries created. That's structurally different from the billing block,
which *does* create a `build` job entry and then blocks it from starting.
Two distinct GitHub error messages, two distinct job-scheduling shapes,
two independent fixes, both confirmed against real runs, not one
misdiagnosed cause redescribed. CI is confirmed green as of 2026-08-07.

One harmless annotation surfaced on the passing run: `actions/checkout@v4`,
`actions/setup-node@v4`, and `pnpm/action-setup@v4` are running on a
deprecated internal Node 20 runner-action-runtime (unrelated to this
project's own Node 22 pin, it's about the version GitHub's runner uses to
execute the action's own code). Not urgent; worth bumping to newer action
versions eventually.

Re-adding a working `osv-scan` job (spec §6/§7 want it as a hard gate) is
still open; next attempt should be validated against a real, isolated
push before being trusted, same caution as before.

**Update 2026-08-08: the billing message resurfaced once, transiently.**
After four consecutive green organic-push runs, one run
(`31241780851`, the `docs(spec)` commit) failed with the exact same
"recent account payments have failed or your spending limit needs to be
increased" message, with the repo confirmed still public
(`gh repo view --json isPrivate` → `false`) at the time. The very next
push, 8 minutes later with no changes to repo settings, succeeded
normally (`31242097451`). Read as a transient false-positive in GitHub's
billing check itself, not a regression back to the private-repo state,
worth knowing this can happen even on a public repo, not worth blocking
on. If it recurs persistently (not just once), revisit.

## README's `upto` link: resolved before Phase 6 formally started

README's "What Periplo is (planned)" section linked `upto`'s spec to
[`spec/`](../spec/), a directory that has never existed in this repo, a
dead link in the most-read file. Turned out moot rather than needing a
wait for Phase 6: the network spec was already opened upstream directly
against `x402-foundation/x402` (PR #3098, issue #3097, both verified real
via the GitHub API: title, draft status, and the same three open
on-chain assumptions this repo's own `docs/SPEC.md` §6 names), work done
in parallel outside this repo's own phase sequence. README now links the
PR directly instead of a local directory.

**Deliberately not mirrored into this repo** (`spec/scheme_upto_stellar.md`
does not exist here, and won't): the RFP deliverable is "merged upstream
into the x402 package," so the PR itself is the evidence, not a local
copy. A duplicate invites drift (one copy updates, the other doesn't) and
a fork of a spec that's actively being upstreamed reads oddly, the
spec's place is upstream. The Soroban contract
(`contracts/upto-settlement`) was still genuinely not started as of this
note. See "Phase 6: environment divergences and real findings" below
for what actually got built.

## Phase 4: environment divergences and real findings

### `Dockerfile.facilitator` didn't build or ship `@periplo/bazaar`: first Phase 4 deploy crash-looped

Found live, immediately after pushing and redeploying: `apps/facilitator`
never had a real runtime dependency on `packages/bazaar` before Phase 4, so
`Dockerfile.facilitator` never built or copied it. Two failures, found and
fixed in sequence against the real deployment, not caught by `pnpm typecheck`
locally (which uses `tsc -b`, project-reference mode, and doesn't need
`dist/` to exist):

1. **Build stage:** `pnpm --filter @periplo/facilitator build` runs plain
   `tsc -p tsconfig.json` (not `-b`), which does not auto-build referenced
   projects. It resolves `@periplo/bazaar` via normal node-module
   resolution against `packages/bazaar/package.json`'s `types` field
   (`dist/index.d.ts`), which didn't exist because nothing had built
   `packages/bazaar` in the image. Fixed: `RUN pnpm --filter @periplo/bazaar
   build` before the facilitator build step.
2. **Runtime stage:** even after the build succeeded, the deployed machine
   crash-looped on `ERR_MODULE_NOT_FOUND: Cannot find package
   '@supabase/supabase-js'`. pnpm gives every workspace package its own
   `node_modules/` of symlinks to its own direct dependencies (resolved
   from the shared store), and `packages/bazaar/node_modules` was never
   copied into the runtime stage, only `dist/` and `package.json`. Fixed by
   adding that copy too.

Both fixes verified against the real deployment: `curl
https://periplo-testnet.fly.dev/supported` returned `"extensions":["bazaar"]`
only after the second deploy, not the first. The first one looked
successful in `fly deploy`'s own output (image built, pushed) right up
until the machine actually tried to boot the new code.

### Bare `pnpm ci` was never actually running the gate script

`pnpm ci` is a reserved pnpm CLI command (`pnpm help ci` → alias for
`clean-install`: `pnpm clean` + `pnpm install --frozen-lockfile`), which
shadows the root `package.json` script of the same name. Bare `pnpm ci`
silently reinstalls dependencies instead of running
`typecheck && lint && test && licence-check`, with nothing pointing at the
shadowing. `pnpm run ci` (explicit `run`) forces package.json resolution
and is the command that actually runs the gate. Caught running this exact
command during Phase 4; low severity in practice, `.github/workflows/ci.yml`
already invokes each step individually (`pnpm typecheck`, `pnpm lint`,
`pnpm test`, `pnpm licence-check`), never the compound `pnpm ci`, and this
session's own phase-gate verifications ran the individual commands too, so
no phase's gate was actually unverified, just documented with a command
that would have silently done the wrong thing if anyone (a reviewer
reproducing the gate locally, most plausibly) had copy-pasted it verbatim.
`CLAUDE.md`'s Commands section now says `pnpm run ci`.

Full detail in `docs/INTEROP.md` (spec §5 Phase 4 requires recording
divergences there specifically); summarized here for the running log.

### Built on `@x402/extensions/bazaar@2.21.0`, not a from-scratch implementation

Discovered mid-phase, before writing any extension-handling code: the
official x402 project ships a complete facilitator-side and resource-server-
side implementation of the bazaar discovery extension as a real published
npm package (`@x402/extensions`, same `2.21.0` pin as `@x402/core`/
`@x402/stellar`, Apache-2.0, confirmed clean by `pnpm licence-check`
including its transitive deps). `apps/facilitator/src/discovery.ts` is built
on `extractDiscoveryInfo`/`validateDiscoveryExtension`/
`validateDiscoveryExtensionSpec` from that package rather than
reimplementing the extension's JSON-Schema validation and info-extraction
logic, same "don't reimplement the wire protocol" principle spec §1
applies to verify/settle, extended here on the session's own judgment
(the package wasn't in the original manifest, so this is flagged per
working rule 6, not silently added).

**Dependency-weight tradeoff, accepted not hidden:** `@x402/extensions`
bundles several extensions in one package (`bazaar`, `builder-code`,
`offer-receipt`, `sign-in-with-x`, `payment-identifier`), and its
`package.json` declares dependencies for all of them: `viem`, `jose`,
`@signinwithethereum/siwe`, `tweetnacl`, `@noble/curves`, even though
`apps/facilitator` only imports the `./bazaar` subpath. pnpm installs the
full declared dependency graph regardless of which subpath is actually
imported, so these ship in `node_modules` (and the Docker image) unused.
No tree-shaking boundary exists at the package-manager level to avoid
this without vendoring or a bundler step, and every one of those
transitive deps passed the license gate on inspection (predominantly MIT).
Not revisited unless image size becomes an actual operational problem.

### `checkRouteTemplate` (Phase 1) used instead of upstream's `isValidRouteTemplate`

One deliberate divergence from "build on the official package": Periplo's
own Phase 1 `routeTemplate` validator (bounded-repeated percent-decoding,
backslash normalization) is used instead of the official package's
single-decode-pass equivalent, because upstream's version doesn't satisfy
spec Phase 4's gate (hard-reject a hostile `routeTemplate`, no catalog row.
Upstream instead silently drops the field and catalogs the unparameterized
URL). Full comparison table in `docs/INTEROP.md` §1.

**Two genuine upstream findings.** The `mcp://` one is filed; the
single-decode one is not yet, pending the project owner's go-ahead
(flagged per working rule 6, not done unilaterally):

1. The single-decode gap above is a real (if narrow) catalog-poisoning
   surface for anyone calling `isValidRouteTemplate` directly. Not filed.
2. `extractDiscoveryInfo` breaks on the `mcp://tool/{toolName}` URL form
   that `docs/SPEC.md` §4 (and the x402 e2e test itself) documents as the
   *expected* MCP resource URL. `mcp:` isn't a WHATWG special scheme, so
   `new URL(...).origin` returns the literal string `"null"`, and upstream's
   canonical-URL logic (`${url.origin}${url.pathname}`) produces
   `"null/toolName"`. Found empirically via the real Supabase integration
   test (`discovery.integration.test.ts`), not by inspection, first run
   against live Supabase surfaced a wrong catalog `url` value. Worked
   around in `discovery.ts` by reconstructing the URL from `toolName`
   directly, bypassing the broken helper's output for MCP resources only.
   **Filed:** [x402-foundation/x402#3121](https://github.com/x402-foundation/x402/issues/3121).
   **Fix open:** [x402-foundation/x402#3138](https://github.com/x402-foundation/x402/pull/3138),
   built to the scheme-agnostic shape a reviewer (whawk46) suggested in the
   issue thread rather than an `mcp://`-specific patch, with a second
   regression test on an unrelated made-up scheme so the fix cannot
   regress the same way for the next undocumented scheme. Full detail in
   `docs/INTEROP.md` §2.

### `resource.serviceName`/`tags`/`iconUrl` are sanitized by upstream but have no catalog column yet

`@x402/extensions/bazaar`'s `extractDiscoveryInfo` already soft-drop-sanitizes
these three optional fields internally (`sanitizeResourceServiceMetadata`,
`isValidServiceName`, `sanitizeTags`, `isValidIconUrl`, printable-ASCII,
length caps, SSRF-defended URL checks) and returns them on the
`DiscoveredResource` it hands back. Periplo's `resources` table
(`supabase/migrations/20260807202307_resources.sql`, Phase 2, unchanged
since before this phase read the upstream package) has no columns for any
of the three, so `discovery.ts` currently reads but discards them rather
than storing something a migration hasn't been gated for. Not silently
dropped: the values are real and sanitized, there's just nowhere to put
them yet. If added later, this is the concrete case `packages/bazaar`'s
`softDropFields` mechanism (Phase 1, already built and tested, currently
unused by Phase 4's own path) was built for: three independently-optional
fields where one failing validation shouldn't reject the other two or the
listing as a whole.

### `docs/SPEC.md` §4's search param name (`q`) doesn't match the real wire (`query`)

Found while reading the official client types (`SearchDiscoveryResourcesParams`)
and the x402 e2e test's own probe, both use `query`. `docs/SPEC.md` was
written from a wire-contract description before this phase actually opened
the source, and Phase 0's own baseline probe against `x402.org` used `?q=`
too, but that request 404'd regardless (no discovery endpoints exist there),
so the wrong param name was never exercised against anything live. Not
corrected in `docs/SPEC.md` yet, `GET /discovery/search` itself is Phase 5
scope, not built in Phase 4. Recorded in `docs/INTEROP.md` §3 so Phase 5
starts from the right name instead of re-deriving it.

## Phase 5: environment divergences and real findings

### Embedding model: no provider was pinned; picked and verified this phase

`docs/SPEC.md` §5 specifies pgvector/HNSW/RRF exactly but never names an
embedding model or provider, a real gap, not an oversight to defer.
Resolved with the project owner (not decided unilaterally): a local model,
no API key, no per-call cost, no new CI secret. Landed on `fastembed`'s
`BGESmallENV15` (384-dim, MIT), not `@huggingface/transformers`:

- `@huggingface/transformers` hard-depends on `sharp` for vision-model
  utilities this project never uses. `sharp`'s prebuilt `libvips` binary
  (`@img/sharp-libvips-linux-x64`) is LGPL-3.0-or-later, a hard `deny`
  under `packages/licence-check`'s own `DENIED_PATTERNS` (spec §1: no
  copyleft anywhere in the *shipped* dependency path), confirmed by
  actually adding the package and running `license-checker` against it,
  not assumed from the package's own top-level `Apache-2.0` claim.
- Considered hand-rolling with `onnxruntime-node` + `@huggingface/
  tokenizers` directly (both clean-licensed) to avoid `sharp` entirely.
  Abandoned: `@huggingface/tokenizers`'s own `Tokenizer` constructor takes
  pre-parsed `(tokenizer, config)` objects, not a `tokenizer.json` file
  path. The file-loading/config-splitting logic lives inside
  `@huggingface/transformers` itself, unexported. Reimplementing HF's own
  tokenizer-config parser from scratch risked a silent correctness bug
  (subtly wrong tokenization degrading search quality with no error
  thrown) for a phase whose entire gate is *measured* quality, a worse
  trade than the alternative below.
- `fastembed` (MIT throughout, verified with `license-checker` before
  adopting it) carries an unpatched, no-non-major-bump-available critical
  `tar@^6.2.0` advisory (path traversal / arbitrary write on archive
  extraction, `npm audit`, `fixAvailable: {isSemVerMajor: true}` to
  `tar@>7.5.20`, which `fastembed@2.1.0`'s own dependency range can't
  reach). Accepted: the archive `tar` extracts is the model file this
  code itself requests from a name it pins
  (`EmbeddingModel.BGESmallENV15`), not attacker-supplied input, the same
  trust boundary every ONNX-model-downloading library in this space has,
  `@huggingface/transformers` included. Documented in
  `packages/search/src/embed.ts`'s own module doc, not hidden.

### `resources.embedding` dimension corrected: 512 (Phase 2 placeholder) → 384

Phase 2 pinned `vector(512)` before any embedding model was chosen.
Migrated in place (`supabase/migrations/20260812080000_search.sql`) since
the column was all-NULL, Phase 4 never wrote embeddings, so there was no
data to lose. HNSW indexes can't survive an `ALTER COLUMN TYPE` on the
underlying vector column; the migration drops and recreates
`resources_embedding_idx` around the `ALTER`, verified by querying
`pg_indexes`/`pg_attribute` against the real project afterward, not
assumed from the migration succeeding silently.

### `onnxruntime-node`'s postinstall downloads a ~340MB CUDA binary by default on Linux/x64: skipped

Found by inspecting `du -sh` on the installed package after a plain
`pnpm install`: `libonnxruntime_providers_cuda.so` alone was 342MB, on a
CPU-only sandbox and a CPU-only Fly deployment (`shared-cpu-1x`, no GPU).
`onnxruntime-node`'s own install script supports
`ONNXRUNTIME_NODE_INSTALL_CUDA=skip` to avoid this; set as an env var
around `pnpm install` in `Dockerfile.facilitator` and
`.github/workflows/ci.yml`. One real gotcha while fixing this locally:
pnpm's content-addressable store caches a package's postinstall *output*,
not just its manifest. Re-running `pnpm install` with the env var newly
set did not re-trigger the download-skip until the store's cached copy of
`onnxruntime-node` was invalidated (`pnpm install --side-effects-cache=false`
after deleting `node_modules`). A fresh Docker build or CI runner has no
such pre-existing cache, so this only mattered for verifying the fix
locally, not for correctness of the actual fix.

Not addressed: the remaining ~208MB still bundles prebuilt binaries for
every platform (darwin, win32, linux/arm64) that this Linux/x64-only
deployment never uses. `Dockerfile.facilitator` copies the whole
`node_modules` tree regardless. A real, smaller follow-up (platform-scoped
pruning) if image size becomes an actual operational problem; not blocking
Phase 5's own gate.

### `fastembed`'s embedding output is a `Float32Array`, not the `number[]` its own `.d.ts` declares

Found against the real Supabase integration test, not from reading the
types: the first live write failed with `invalid input syntax for type
vector`, carrying a payload shaped like `{"0":v0,"1":v1,...}` instead of
`[v0,v1,...]`. Root cause: `JSON.stringify` serializes a `Float32Array` as
a plain object keyed by index, not as a JSON array, and `passageEmbed`/
`queryEmbed` both return `Float32Array` at runtime despite the package's
own type declarations saying `number[]`. Fixed with `Array.from(...)` in
`packages/search/src/embed.ts` before the vector ever reaches
`upsertCatalogResource`; documented inline so it survives a future
refactor. Verified against the live project afterward (insert, then a real
`periplo_hybrid_search` call, then delete), the fix, not just the absence
of a thrown error, is what got checked.

### The eval harness's synthetic catalog is hand-authored, not sampled from real cataloged resources

`eval/fixtures.ts`'s resources and `eval/golden.jsonl`'s queries are
written by hand, not harvested from `resources` table rows a real payment
cataloged. The live catalog doesn't yet have enough diverse, real
listings to build a meaningful graded set from (most rows so far are
Phase 3/4 test/demo artifacts, not a real marketplace). Each fixture is
still seeded through the real write path (`@periplo/bazaar`'s
`upsertCatalogResource`, the same function a real payment calls) and
embedded through the real model, only the *content* of what's being
cataloged is synthetic, not the mechanism cataloging it. Revisit once the
catalog has organic, diverse listings to sample from instead.

### The first eval set (20 resources, 40 queries) was too easy: a review caught it before it became the committed baseline

The original design put every resource in an unrelated domain (weather,
translate, currency, ...), so every query had exactly one plausible
candidate out of twenty wildly different options. That scored nDCG@10
0.9908, MRR 0.9875, a near-perfect result on a small, self-authored
golden set, which is a classic overfitting signal, not evidence the
ranker actually discriminates between similar options. Caught by review
before committing it as the baseline, not after.

Fixed by adding ~15 clusters of 2-5 genuine near-duplicate resources each
on top of the original 20 (`geocode` vs. `reverse-geocode`; `weather` vs.
`weather-forecast` vs. `air-quality` vs. `uv-index` vs. `weather-alerts`;
`send-email` vs. `send-sms` vs. `send-push`; and eleven more), and writing
queries designed to force real discrimination: paraphrases that share no
vocabulary with the *wrong* sibling resource, deliberately ambiguous
"convert"/"check"/"look up" queries tested against multiple plausible
candidates, and multi-relevant judgments (grade 3 for the best match,
grade 1 for a plausible-but-wrong sibling) instead of a single correct
answer per query. Final set: 55 resources, 300 graded queries.

The real, unmodified result: **nDCG@10 0.9346, MRR 0.9226**, a genuine
drop from 0.9908, reported as-is rather than tuned back toward the old
number (the person who flagged the overfitting risk explicitly said the
score dropping was an acceptable, expected outcome). A worst-query
breakdown (run once, not committed as a script) showed 231/300 queries
still scoring a perfect nDCG@10, 0/300 scoring zero (the ranker never
completely misses, some relevant result always appears, just not always
ranked first), and every one of the 69 imperfect queries was a genuine
near-duplicate confusion the clusters were built to surface, e.g.
`reverse-geocode` queries occasionally ranking plain `geocode` first, or
`weather` queries occasionally ranking `uv-index` first. That distribution
(mostly right, sometimes confuses close near-duplicates, never totally
lost) reads as a believable result for a real hybrid retrieval system,
which the original 0.99 did not.

### Not yet done: growing the golden set further, and load-hardening the search endpoint

Two engineering follow-ups this phase's gate does not require but a later
one should:

- The golden query set (55 resources, 300 graded queries) is planned to
  grow toward 500 graded queries, for stronger coverage of near-duplicate
  clusters beyond what's built so far and more stable nDCG@10/MRR numbers
  than 300 queries give.
- The search endpoint itself has not been hardened or tested under real
  load (concurrent request handling, embedding-model warm-up contention,
  Supabase connection pooling under sustained traffic). Phase 5's gate is
  ranking quality, not throughput, and production readiness on that axis
  is still open.

## Phase 6: environment divergences and real findings

### `stellar contract init`'s default layout double-nests the crate directory

Scaffolding with `stellar contract init contracts/upto-settlement --name
upto-settlement` produces `contracts/upto-settlement/contracts/upto-settlement/`,
a workspace-of-workspaces layout meant for repos with multiple
contracts. Since this repo only ever plans one Soroban contract, flattened
it: single `Cargo.toml` at `contracts/upto-settlement/`, `src/` directly
underneath, matching the path `docs/SPEC.md` §3 names.

### `env.register()` panics at ledger sequences near `u32::MAX`: a testutils/host limitation, not a contract bug

Found by the `cargo-fuzz` target after removing an earlier clamp: an
unclamped `u32` ledger-sequence input near 4.29 billion made
`env.register(UptoSettlement, ())` itself panic
(`HostError: Error(Context, InternalError)`, `soroban-sdk-27.0.5/src/env.rs:1106`),
before any `UptoSettlement` code ran. Isolated with a standalone test
containing only `Env::default()` + `ledger().with_mut()` +
`env.register()`, same panic, zero contract-specific code involved,
confirming it's `soroban-sdk`'s test-contract registration path running
out of internal TTL headroom at that height, not anything this contract
does. Real Stellar is nowhere near ledger 4.29 billion (~680 years of
runtime at 5s/ledger from genesis) and won't be for centuries, so
`fuzz_settle_arithmetic` clamps ledger inputs to a realistic-but-generous
`0..100_000_000` range instead of the raw `u32` space. Not filed upstream,
fuzzing an unreachable-in-practice height isn't a useful bug report,
and the fix (bound the fuzz input to a plausible range) is the correct
response either way.

### Property tests wrote a snapshot per randomized case: 1,557 files, 24MB, never committed

`soroban-sdk`'s test harness writes a `test_snapshots/*.json` file per
test by default (`EnvTestConfig::capture_snapshot_at_drop`, on by
default), sensible for the 21 fixed-point unit tests (committed as
regression evidence, per the smart-contracts skill's own recommendation),
useless noise for `proptest`-driven property tests that each run ~256
randomized cases. Caught before committing anything, not after: `git diff
--stat` on the untracked `contracts/` tree showed page after page of
`..._rejects_every_subsequent_actual_amount.1.json` through `.256.json`
style filenames. Fixed by splitting `test::setup` into `setup` (default
`Env`, snapshots on) and `setup_with_env` (takes a pre-built `Env`), with
`property_test::setup_at` constructing its own `Env::new_with_config(
EnvTestConfig { capture_snapshot_at_drop: false })` instead of reusing
`setup` directly, exactly the skill's own documented escape hatch for
this exact situation ("Disable per-env with `Env::new_with_config` if
they're noise"), not a workaround improvised after the fact.

### `cargo-fuzz` needed no `clang`: `gcc` was already sufficient

The smart-contracts skill's fuzz-testing section assumes `clang`/LLVM for
libFuzzer; this machine has no `clang` and no passwordless `sudo` to
install it. Before treating that as a blocker, tried building anyway:
`cargo install cargo-fuzz --locked` and `cargo +nightly fuzz build`
succeeded cleanly against the system `gcc` (13.3.0), `libfuzzer-sys`
bundles its own libFuzzer runtime and only needs a working C compiler to
build it, not specifically `clang`. Ran for real: 47,630 executions in
180 seconds, zero crashes after fixing two harness bugs it found along
the way (a fixed buyer-supply constant smaller than a fuzzed `max_amount`,
and the ledger-height issue above), both harness issues, not contract
bugs, confirmed by isolating each with a standalone reproduction before
"fixing" anything.

### An internal security review ran on this contract. It is not, and is not presented as, a third-party audit.

`docs/SKILLS.md` had flagged `security-review` as overdue since Phase 3,
specifically for "the `upto` contract, real money-adjacent," so it ran
before this phase was called done: every vulnerability class in the
`smart-contracts` skill's own checklist (missing auth, auth replay
through middleware, reentrancy, integer overflow, TTL-as-security,
arbitrary token addresses) walked by hand against the actual code, plus
the Soroban-specific properties the checklist doesn't name directly
(atomicity-on-panic protecting the nonce-then-transfer ordering, the
platform's own reentrancy guarantee ruling out a hostile-token
callback). Nothing above a false-positive threshold survived scrutiny.

**What this is not:** a substitute for independent third-party review.
This was a single AI-assisted pass by the same agent that wrote the
contract, with no second reviewer, no formal verification tooling
(Certora Sunbeam, Komet), and no adversarial incentive the way a paid
audit or a bug bounty carries one. It found no issues, which is weaker
evidence of correctness than an external audit finding no issues would
be, the same blind spots that shaped the code are available to review
it. The real pending step before this contract should move any
production value is a third-party audit. **Audit Bank** is the
SDF-subsidized program built for exactly this (SCF-funded protocols,
partner firms including OtterSec, Veridise, Runtime Verification,
CoinFabrik, Certora, Zellic, Code4rena), tracked as a genuine Phase 10
blocker in this file's "Deliberately not self-served" list ("Audit Bank
engagement, a program application, not something to submit
unilaterally"), not something this session can complete on its own.
Static analysis (`cargo scout-audit`, OpenZeppelin's Security Detectors
SDK) has also not been run, a cheaper, faster gap than the audit itself,
and one that could reasonably run before Phase 10 rather than waiting for
it; noted here rather than done, since it wasn't part of this phase's
gate.

### `Client.from(...)` fetches the on-chain contract spec live: no generated bindings committed

`apps/facilitator/scripts/upto-settle-demo.ts` (the verification script
that produced the settled transaction in `conformance/RESULTS.md`) uses
`@stellar/stellar-sdk/contract`'s `Client.from({ contractId, ... })`
rather than `stellar contract bindings typescript`'s generated package.
`Client.from` resolves the contract's spec from the deployed WASM over
RPC at call time, so the script has no generated-bindings artifact to
keep in sync with the contract or commit. It stays reproducible from a
clean checkout against whatever is actually deployed at
`UPTO_SETTLEMENT_CONTRACT_TESTNET`. Bindings were generated once, into
the session scratchpad, only to read the exact generated method
signature (`settle({authorization, actual_amount}, opts?)`) before writing
the hand-rolled call, never committed, not needed at runtime.

### The full upstream TypeScript package is still open work, not this phase's gate

`docs/SPEC.md` §6 names `typescript/packages/mechanisms/stellar/src/upto/`
(mirroring `@x402/stellar`'s existing `src/exact/`) as part of Phase 6's
scope, alongside the contract and the spec. The spec is upstream (PR
#3098, already open). The contract is built, tested, deployed, and
settled a real transaction (this phase's actual gate, per §6's own gate
line: `cargo test` passes, contract deployed to testnet, a settled `upto`
transaction hash recorded, three assumptions closed). The TypeScript
client/facilitator package, the piece that would let
`apps/facilitator`'s own `/verify`/`/settle` routes actually serve `upto`
requests over HTTP, not just a one-off verification script, is separate,
larger, not-yet-started work. `apps/facilitator/scripts/upto-settle-demo.ts`
proves the contract and the wire-level auth mechanism both work for real;
it is not that package.

### `upto` spec convergence with a competing PR: #3098 now documents two profiles

A second PR against the same spec file,
[x402-foundation/x402#3134](https://github.com/x402-foundation/x402/pull/3134)
by [Iam0TI](https://github.com/Iam0TI) with a reference implementation at
[`0d1026/Rialto`](https://github.com/0d1026/Rialto), proposed a different
`upto` mechanism: a stateless settlement contract using SEP-41
`approve`/`transfer_from` instead of this project's pull-and-refund
design, relying on Soroban's own per-entry auth nonce instead of an
app-managed `temporary()`-storage nonce, and settling without binding to
one named facilitator. Both PRs touched the exact same file, which the
`#3134` author's own PR description flagged as something worth
converging on rather than leaving for maintainers to arbitrate between.

Before drafting anything public, ran an honest technical comparison of
the two designs, not advocacy for either, covering: whether the native
Soroban nonce actually gives equivalent replay protection, what the
`stateless` design's facilitator-agnostic tradeoff means concretely, what
pull-and-refund buys against a straight `transfer_from`, and whether
either design changes for a C-account payer. Found real strengths on
both sides. `stateless` genuinely removes an entire implementation-bug
class, since there is no author-sized TTL to get wrong, replay
protection is the protocol's own guarantee, and it settles measurably
cheaper: pulled real `fee_charged` numbers from both projects' own
settled testnet transactions, roughly 25 to 30 percent lower. This
project's `contract` design closes a real gap `stateless` leaves open. A
leaked or multiply-forwarded authorization can be settled by anyone
holding it, for up to the full signed ceiling, not just the facilitator
the resource server intended.

Also found, while comparing the two contracts closely: `stateless`'s
`autoRevoke = false` option lets a **later, unrelated** authorization
silently overwrite a deliberately preserved leftover allowance, since
SEP-41 `approve` replaces rather than adds. Raised generously as a
finding worth documenting, not a defect, in the PR comment.

Both of `#3134`'s cited testnet transactions were independently verified
before being cited as fact in a spec change, not taken on trust. Decoded
the `settle` call's own I128 arguments straight from each operation's
raw XDR, confirming one is a genuine partial settlement (`300,000` of a
`1,000,000` signed ceiling) and the other a genuine maximum settlement
(`500,000` of `500,000`), matching the same bar this project holds its
own numbers to.

**Outcome:** `#3098` now documents both profiles, `contract`, this
project's design, still the default, and `stateless`, credited to
Iam0TI, `0d1026/Rialto`, and `#3134` by name, plus the C-account/smart-wallet
spec language `#3098`'s prose was missing entirely (it was written in
G-account terms only, even though the contract mechanism already worked
for C-accounts). A comment was posted to `#3134` crediting the specific
strengths found, raising the `autoRevoke` finding, and proposing the
merged-spec outcome the author had already asked for. `#3098` was marked
ready for review once this landed.

### x402-foundation/x402 requires signed commits. Nothing was configured for it in this environment

Found when `#3098`'s bot check flagged a pushed commit as unsigned, with
a one-week auto-close clock attached. `commit.gpgsign`, `user.signingkey`,
and `gpg.format` were all unset in this environment, no SSH keypair
existed under `~/.ssh` beyond `known_hosts`, and the local GPG keyring
was empty. Confirmed rather than assumed, checked each setting directly
before concluding nothing existed.

Registering a new SSH signing key against a GitHub account through the
API needs the `admin:ssh_signing_key` OAuth scope, which the `gh` token
in this environment did not have. Requesting it triggers an interactive
browser device-code flow
(`gh auth refresh -h github.com -s admin:ssh_signing_key`) with no way to
complete it non-interactively, the same class of blocker already
recorded for the Raven MCP sign-in. Generated a dedicated,
passphrase-less ed25519 signing-only key locally instead
(`~/.ssh/id_ed25519_signing`, no push or login authority), and had the
user add its public half through GitHub's own web UI as a Signing Key, a
thirty-second manual action that needed no elevated token scope at all.
Verified the key was actually registered via the public, unauthenticated
`GET /users/{username}/ssh_signing_keys` endpoint before trusting it, not
just the screenshot the user pasted back.

One thing this surfaced: the account already had a signing key
registered from a different machine (titled to reference an Eras256
laptop, added 2026-08-08), absent from this environment entirely,
confirming key material genuinely does not travel between environments
even for the same account.

Configured `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`,
and a local `gpg.ssh.allowedSignersFile` scoped per repository clone, not
globally, since the actual requirement, `x402-foundation/x402`'s own
contribution policy, is specific to that one upstream project, not a
Periplo-wide or portfolio-wide default. Applied identically to both
`#3098`'s branch and `#3138`'s branch, and confirmed `Verified` on
GitHub's own API (`verified: true`, `reason: valid`) for every commit on
both, not just checked locally.

## `upto` profile discrimination: three real implementation gaps, found responding to external review, not self-discovered

[HeylmStoned's comment](https://github.com/x402-foundation/x402/pull/3134)
on `#3134` raised a wire-level concern: if both `contract` and `stateless`
ship as conformant `upto` profiles, `scheme: "upto"` alone is ambiguous on
the wire, and Periplo's own `/supported`, `PaymentRequirements.extra`, and
Bazaar catalog filters need a stable way to discriminate between them. The
spec text itself already has an answer: `extra.uptoProfile` is defined as a
required, shared `PaymentRequirements` field in `#3098`'s
`scheme_upto_stellar.md`. Checked against Periplo's actual code, not the
spec text, per the same standard this project holds every other capability
claim to, three real gaps surfaced, none of them previously recorded:

1. **`/supported` cannot report `upto` at all, in any form. Still open,
   and it's the one gap that doesn't close with a small fix.**
   `apps/facilitator/src/core.ts` registers only `ExactStellarScheme`. Since
   `upto` isn't wired into the HTTP facilitator yet (already noted in this
   file's Phase 6 section), there is currently no `upto` kind to
   discriminate a profile on in the first place. Closing this for real
   needs a genuine `UptoStellarScheme` (verify/settle/getSigners/getExtra)
   registered against `x402Facilitator`, mirroring `@x402/stellar`'s own
   `exact` implementation against the deployed `UptoSettlement` contract's
   two-signature flow (buyer `require_auth_for_args`, facilitator
   `require_auth`, `docs/SPEC.md` §6's
   `typescript/packages/mechanisms/stellar/src/upto/` target). That's a new
   scheme implementation, not a wiring gap, and payment-critical code
   deserves its own scoped pass rather than a rushed stub. Scoped honestly
   here in preference to either skipping it silently or shipping something
   undertested against real funds.
2. **Closed 2026-08-17.** No `GET /discovery/resources` or
   `GET /discovery/search` HTTP route existed in `apps/facilitator` at all
   (grepped, zero hits; even the filters `docs/SPEC.md` §4 names, `type`,
   `payTo`, `network`, `extensions`, were unimplemented, not just a
   `scheme`/profile dimension). Both routes now exist:
   `apps/facilitator/src/discovery-routes.ts`, reusing
   `@x402/extensions/bazaar`'s own `DiscoveryResource`/
   `DiscoveryResourcesResponse`/`SearchDiscoveryResourcesResponse` types
   directly rather than redefining the wire shape, wired into `app.ts` and
   covered by 12 new tests (`discovery-routes.test.ts`, plus route-level
   tests in `app.test.ts`). `GET /discovery/search`'s filters apply as an
   in-process post-filter over `hybridSearch`'s ranked rows, not a fifth SQL
   parameter, since `periplo_hybrid_search` doesn't take them, documented as
   a real, honest limitation in the module's own doc comment, not hidden.
3. **Closed 2026-08-17.** `packages/bazaar/src/db/catalog.ts`'s
   `mergeAccepts` dedupe key was not `extra`-aware, a real data-loss risk,
   not just a missing feature: the key was
   `${scheme}|${network}|${asset}|${payTo}`, so two `accepts` entries
   differing only in `extra.uptoProfile` hashed to the same key and would
   have silently overwritten each other. `dedupeKey` now folds in
   `extra.uptoProfile` unconditionally (safe for every existing scheme: one
   without a profile, like `exact`, degrades to the pre-fix key exactly),
   with three new regression tests covering distinct profiles coexisting, a
   same-profile entry still replacing rather than duplicating, and a missing
   profile being treated as distinct from a present one.

Recorded here first, deliberately, before any reply was drafted or posted
for #1-#3 originally, so the finding was on record independent of how the
thread response read. #2 and #3 are shipped, with their own commits and
tests, clickable rather than asserted. #1 remains open, honestly scoped
above rather than stubbed.

## Phase 6b: additional evidence for `upto` on Stellar, not an SCF tranche deliverable

Two extension scenarios beyond Phase 6's own gate, same treatment as the
Phase 4/5/6 additions before it: real testnet transactions, checked
against Horizon, not unit tests standing in for them.

### Zero-settlement: done, with real evidence

A genuine `actual_amount = 0` settlement against the already-deployed
Phase 6 contract (`CAK3R734WLT4JU2XMQOJ6NIB3BWGPI442CH44EFJG5AORMXFE7G4MQFW`,
unchanged), needing no contract code at all: `settle` never special-cases
`actual_amount == 0`, so the existing pull-and-refund logic already
handles it correctly, confirmed first by the pre-existing unit test
`zero_settlement_refunds_everything`, then for real.
`apps/facilitator/scripts/upto-settle-zero-demo.ts` produced a real
settled transaction
(`2138c0418a85e1bb29c2eab6cea6c76b3b0231d894450a35905053f36403d358`),
independently checked against Horizon: the buyer's balance is unchanged
before and after (the full `0.05 PTEST` ceiling came back), the seller's
balance is unchanged (nothing was charged), and `/effects` shows the full
pull-then-refund sequence with no transfer to the seller at all, matching
`settle`'s own `if actual_amount > 0` guard around that leg. A second,
genuine replay attempt against the same authorization was rejected on
testnet with `Error(Contract, #6)` (`AuthorizationConsumed`), confirming
the nonce is consumed even when nothing was actually charged, not just
when a real transfer happens. Recorded in `conformance/RESULTS.md`.

### OpenZeppelin smart-account integration: contract and account both built and tested, live transaction still open

The scenario: an agent's key wrapped in a real `stellar-accounts` smart
account, scoped so it can only ever authorize calls to the deployed
`UptoSettlement` instance, spending against a reserved budget reconciled
against the actual amount charged, not the signed ceiling.

**What's genuinely done, verified two different ways:**

- `contracts/upto-settlement/src/budget.rs`: a new, purely additive,
  strictly opt-in reconciliation path in `settle`, called after
  `actual_amount` is validated and before any transfer moves funds. Eight
  new unit tests prove it's keyed on `actual_amount`, not `max_amount`
  (`budget_is_debited_by_actual_amount_not_max_amount` settles for far
  less than `max_amount` and confirms the budget only moved by the real
  charge), that a settlement exceeding the remaining budget is rejected
  even when `max_amount` has room (`a_settlement_that_would_exceed_the_
  remaining_budget_is_rejected`), that a zero-amount settlement never
  touches the budget (`zero_settlement_never_touches_the_budget`,
  matching OpenZeppelin's own rule for the stock policy), and that the
  rolling window genuinely evicts expired spend
  (`budget_rolling_window_evicts_expired_spend`). All 27 pre-existing
  Phase 6 tests still pass unchanged, and the fuzz target still runs
  clean (21,402 executions, zero crashes, after adding the three new
  `Error` variants to its exhaustive match).
- `contracts/agent-smart-account/`: a new, standalone Cargo crate, a real
  `stellar-accounts` (MIT, `OpenZeppelin/stellar-contracts`) smart
  account, not a mock. Its `__constructor` creates one `ContextRule` of
  type `CallContract(upto_settlement_address)` with a single
  `Signer::Delegated(agent_key)`. Three unit tests call `__check_auth`
  directly (via `env.as_contract`, not mocked past): a call scoped to the
  registered contract with the right signer succeeds, a call to any other
  contract is rejected even with a fully valid signature (the actual
  claim this scenario makes: the agent key cannot spend anywhere except
  through `UptoSettlement`), and a signature from an unregistered signer
  is rejected. Both contracts are deployed to `stellar:testnet`:
  `UptoSettlement` (Phase 6b) at
  `CDJY6YLHORR5WYCJM5OQZQZ5SBGBMFZZFRHSIMKEQ2N2KNX237K2B42Q` (a new
  instance, not an upgrade of Phase 6's own deployment, since the
  contract has no upgrade mechanism and re-verifying the whole Phase 6
  gate against a downgraded SDK version to add one was rejected, see
  below), and `agent-smart-account` at
  `CAG4OYCEYXHM3SYWMXBITBB6RGYDDHXUQKILFSBTMTPIGLJHDSX42DAJ`, constructed
  against a real, dedicated, funded testnet keypair
  (`GA7VZHIP2TJPXJGAMCN5BO7HJC5H4YWX5PZ5ZBHRD4BFD6EXT6NALLP5`) as the
  agent key. Queried directly from the live contract, not just asserted:
  `get_context_rule(0)` on the deployed account returns exactly the
  configured rule, scoped to the deployed `UptoSettlement` address, with
  the agent key as its one Delegated signer.

**A real, load-bearing environment finding along the way**: the published
`stellar-accounts` crate on crates.io (0.7.2, the latest stable as of
this writing) pins `soroban-sdk ^26.1`, not the `27.x` line this
project's already-deployed, already-proven Phase 6 contract targets
(matching the live testnet protocol version). Confirmed by a real build
attempt, not assumed from the version numbers: adding `stellar-accounts`
directly to `upto-settlement`'s own `Cargo.toml` pulled in a second,
incompatible `soroban-sdk` into the same dependency graph, producing
genuine type errors at every storage read and write (two distinct
`soroban_sdk::Vec` types, neither convertible to the other). The upstream
`stellar-contracts` repo's own unreleased `main` branch has already moved
its workspace pin to `soroban-sdk 27.0.2`, so this is a real but likely
temporary publish lag, not a permanent incompatibility. Resolved by
keeping `upto-settlement` dependency-free of `stellar-accounts` (its
`budget.rs` mirrors `SpendingLimitData`/`SpendingEntry` field-for-field
instead of importing them, documented as such in that module's own doc
comment) and giving the real dependency only to the new,
independent `agent-smart-account` crate, which has no such conflict and
can freely target the SDK version the account framework actually
requires.

**What's still open: a real, signed, cross-contract settlement
transaction specifically.** Everything above is proven at the Rust level
and independently confirmed against the live, deployed contract state.
What has not yet been produced is a genuine testnet transaction where
`authorization.from` is the smart account and the settlement actually
goes through, the same evidence bar every other Phase 6/6b claim in this
file meets. This was attempted at real length, not given up on early:

- Simulating a call where the smart account is the buyer correctly
  surfaces the need for its own top-level authorization entry
  (`needsNonInvokerSigningBy()` reports the smart account's address), but
  the simulation's auth-recording pass does not itself invoke
  `__check_auth`, so it never surfaces the *nested* requirement
  `authenticate()` creates for the agent's own key
  (`Signer::Delegated`'s verification is `addr.require_auth_for_args(
  (auth_digest,))`, called from inside `__check_auth` itself). That
  nested entry has to be constructed by hand, which OpenZeppelin's own
  documentation explicitly names as a real gap in tooling, not something
  this session missed: "This model requires manual authorization entry
  crafting, because it is not returned in a simulation mode."
- Reasoned out and confirmed against `do_check_auth`'s real source (not
  guessed) that the nested entry's digest is not `signature_payload`
  directly, but `sha256(signature_payload.to_bytes() ++
  context_rule_ids.to_xdr())`, binding which context rule was selected
  into what the delegated signer actually attests to.
- Correctly encoding the `AuthPayload` signature itself required
  abandoning a hand-built XDR attempt (which produced a value the
  contract's own generated argument-unmarshaling code silently rejected)
  in favor of generating real TypeScript bindings from the deployed
  contract's own spec (`stellar contract bindings typescript`) and
  encoding through its embedded `ContractSpec`, eliminating guesswork
  about the exact shape.
- None of this closed the gap. Every constructed transaction still traps
  inside `__check_auth` itself
  (`HostError: Error(Auth, InvalidAction)`, `VM call trapped:
  UnreachableCodeReached`) before `do_check_auth`'s own business logic
  ever runs, confirmed by testing with an empty `signers` map (which
  should fail with a *typed*, controlled `SmartAccountError` at worst,
  not a raw VM trap, if the encoding were the only remaining problem) and
  by testing with only the smart account's own entry present, no nested
  entry at all (identical trap either way, ruling out the nested entry as
  the cause). The isolation work rules out several specific hypotheses
  (hand-built vs. spec-generated `AuthPayload` encoding, nonce reuse
  across two `simulateTransaction` calls vs. a fresh nonce, the nested
  entry's presence or absence) without yet finding what actually causes
  the trap.

Not fabricated, not skipped silently. The contract-level and
account-level work above is real, tested, and deployed; the live
transaction is a genuinely open item, most likely worth a fresh attempt
using `Signer::External` (a direct signature check against a verifier
contract, architecturally simpler and needing no nested auth entry at
all) instead of `Signer::Delegated`, or a working example from
OpenZeppelin directly, since their own documentation names this exact
gap without supplying one.

### The `soroban-sdk ^26.1` vs `27.x` mismatch was tested directly as a cause of the trap, and ruled out

Before treating the trap above as a real, independent problem worth an
upstream issue, the most obvious simpler explanation was checked
directly rather than assumed away: the already-documented `soroban-sdk`
version mismatch between the published `stellar-accounts` crate
(`^26.1`) and `upto-settlement` (`27.0.5`).

`agent-smart-account` was rebuilt against `stellar-contracts`' own
unreleased `main` branch (commit `fbfde388e1b72afa93d6b1c922067879b20e81db`,
which already pins `soroban-sdk 27.0.2`) instead of the published
`0.7.2` crate, resolving to `soroban-sdk 27.0.6`, the same major.minor
line as `upto-settlement`'s `27.0.5`. All three unit tests still passed
unchanged. A fresh instance was deployed to testnet
(`CB3XXKZLHTTTJEZF6URNVK66E5JAEBYRO2VMRP6JO3SYPCV4GAA7MNN2`) with the
same `agent_key`/`upto_settlement` constructor arguments as the original,
and the exact same auth-entry construction (spec-driven `AuthPayload`
encoding, the `auth_digest = sha256(signature_payload ++
xdr(context_rule_ids))` derivation confirmed against `do_check_auth`'s
own source, both entries built via `authorizeEntry`/`authorizeInvocation`)
was retried against it.

The trap was identical: the same `HostError: Error(Auth, InvalidAction)`,
the same `VM call trapped: UnreachableCodeReached` inside `__check_auth`.
Version alignment changed nothing. The experiment was reverted
(`agent-smart-account` back to the published `stellar-accounts@0.7.2` /
`soroban-sdk@26.1.1` pin, no permanent change), since a git dependency
on an unreleased, movable branch is less reproducible than a published
crate version and bought nothing once the hypothesis came back negative.

The `^26.1` vs `27.x` mismatch stands as a real, independently worth
recording environment finding (see above), but it is now confirmed, not
assumed, to be a separate thing from the `__check_auth` trap, not its
cause.

### Isolated from `UptoSettlement` entirely: the trap reproduces identically against a trivial target contract

The second simpler explanation checked before treating the trap as a
real, independent problem: that it was specific to `UptoSettlement`'s
own complexity (storage reads, nonce handling, the `budget` module),
not to the smart-account/auth layer itself.

A minimal `probe` contract was built with no storage, no nonce, and no
business logic at all:

```rust
#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Env};
#[contract]
pub struct Probe;
#[contractimpl]
impl Probe {
    pub fn ping(_env: Env, caller: Address) {
        caller.require_auth();
    }
}
```

Deployed to testnet at
`CCLBQEUKTDBJTMK7BYP2NGTGH5FF5HY5RJGOXWKGRTNUSFBH6S77A23H` (429 bytes,
wasm hash `2bcc2ed52aab41eaf772a1d546ea65cf2ec04abfbdd4d0660881090692fa470b`).
A fresh `agent-smart-account` instance, built from the published
`stellar-accounts@0.7.2` crate (not the version-alignment experiment
above), was deployed and scoped via `ContextRule::CallContract` to this
`probe` contract instead of `UptoSettlement`:
`CBQAYHHTFAYUL7OY7SCVP67LGTCMW77K6UUH6B5LRTUF52GCMNJICRG3` (wasm hash
`7c9ed845a00a9ff7638c7b64bfaa089fed7a1f8d771772f6bbf9877d377a1ab7`).

`probe.ping({caller: smart_account})` was simulated with the same
two-entry auth tree used throughout this investigation: entry0 for the
smart account via `authorizeEntry` with a spec-encoded `AuthPayload`
signer callback, entry1 for the agent key via `authorizeInvocation`
with the `auth_digest = sha256(signature_payload ++
xdr(context_rule_ids))` derivation confirmed against `do_check_auth`'s
own source.

The trap was identical:

```
SIMULATION ERROR: HostError: Error(Auth, InvalidAction)
...
2: contract:CBQAYHHTF... topics:[error, Error(WasmVm, InvalidAction)]
   data:["VM call trapped: UnreachableCodeReached", __check_auth]
```

Confirmed, not assumed: the trap does not depend on `UptoSettlement`,
its storage, its nonce handling, or its budget-reconciliation logic. It
reproduces against a target contract with a single line of body
(`caller.require_auth()`), scoped through the exact same
`ContextRule::CallContract` mechanism. This narrows the trap to the
`stellar-accounts`/`__check_auth` machinery itself, or to how this
build's client-side auth-entry construction feeds it, independent of
anything specific to Periplo's own contract.

### `stellar-accounts` itself has no test that exercises this path: checked two independent ways

Before drafting an upstream issue, checked whether `stellar-accounts`
(the published `0.7.2` crate) or its own official example
(`examples/multisig-smart-account` in `OpenZeppelin/stellar-contracts`)
already has a reference test for `Signer::Delegated` +
`ContextRuleType::CallContract` that could be diffed against, in either
direction: does the reference case pass clean (compare construction
step by step), or does it trap identically (a clean library bug)?

Neither. `grep -rn "SorobanAuthorizationEntry\|set_auths\|
authorize_as_current_contract"` across the full crate source returned
nothing, and manual reading of every test touching `Signer::Delegated`
+ `ContextRuleType::CallContract` (`src/smart_account/test/
context_rules.rs` in the crate itself,
`examples/multisig-smart-account/account/src/test.rs` in the repo's own
official example) confirmed the same pattern in both: every one calls
`do_check_auth` directly as a plain Rust function inside
`e.mock_all_auths()`, with empty signature bytes
(`create_signatures`'s `Bytes::new(e)` per signer) and an arbitrary
payload never derived by the host. None of them construct a real
`SorobanAuthorizationEntry` tree or drive it through the host's actual
`__check_auth` invocation, the mechanism this build's auth-entry
construction depends on. `Architecture.md` does not document the
`auth_digest` derivation either; the only source for it is
`do_check_auth`'s own Rust body, already read directly for this build's
construction.

This does not rule out an error on this build's own side. It does mean
there is no reference case, in either direction, to diff against, and
that the real host-driven path for `Signer::Delegated` +
`ContextRuleType::CallContract` appears to have no test coverage
upstream, at either the library or its own example level, which raises
the odds this is a genuine, currently-untested gap rather than a
misuse of a well-exercised path.

**Filed:** [OpenZeppelin/stellar-contracts#839](https://github.com/OpenZeppelin/stellar-contracts/issues/839),
framed as a request for diagnostic help rather than a confirmed bug
report, first contact with this maintainer. Open, unresolved as of
this writing; the live cross-contract settlement transaction for this
scenario remains blocked on whatever the answer turns out to be.

### `Signer::External` retried in place of `Signer::Delegated`, and ruled out as the differentiator

Reviewing `stellar_accounts::smart_account::storage::authenticate`'s two
arms side by side (`Delegated` needs a second, nested, hand-constructed
auth entry; `External` verifies a raw Ed25519 signature via one
cross-contract call, entirely inside the account's own single entry) was
a real, motivated reason to retry with `External`, not a guess. The
retry was built completely, not half-attempted:

- `contracts/agent-verifier` (new crate): a deployable Ed25519 `Verifier`
  wrapping `stellar_accounts::verifiers::ed25519`, five unit tests with
  real signatures (genuine accept, wrong-key rejection, tampered-message
  rejection, both canonicalization paths). Deployed to `stellar:testnet`
  at `CAG4XLOGOBQUKRV4QESCYDJHY5IPTINTC64XDXF5EHA5GXACVVRA6TU3`.
- `contracts/agent-smart-account` rewritten for `Signer::External`, and
  given a *second* `ContextRule`: a real `settle()` call presents
  `__check_auth` with two contexts in one invocation (the top-level
  `settle`, and the nested SEP-41 `transfer` it makes to pull the
  buyer's funds), each needing its own matching
  `ContextRuleType::CallContract`. Four unit tests pass, including one
  proving both contexts validate together against `context_rule_ids`
  aligned by index, matching `stellar-accounts`' own
  `do_check_auth_multiple_contexts_success` convention. Redeployed at
  `CA3LQLUJWT3GIRIGFIRKLO73CLLOWY7TKTFFOB5VCSYHARGHNVEPSZEB`, scoped to
  the Phase 6b `UptoSettlement` instance
  (`CDJY6YLHORR5WYCJM5OQZQZ5SBGBMFZZFRHSIMKEQ2N2KNX237K2B42Q`) and the
  test asset.
- The `Signer::External` ScVal encoding used to sign was checked against
  ground truth, not assumed correct: `get_context_rule(0)`'s real,
  on-chain, already-encoded `Signer::External` value was pulled via a
  live simulation and diffed byte-for-byte against this build's own
  `spec.nativeToUdt(...)` output for the same logical value. Identical.

A real, signed `settle()` transaction was submitted through the
two-context smart account:
[`9cc42fde13834730b4c6d031a7be9562f6dc7080f91d8c2daefa6413c51640c0`](https://stellar.expert/explorer/testnet/tx/9cc42fde13834730b4c6d031a7be9562f6dc7080f91d8c2daefa6413c51640c0)
(ledger 4148611). **It failed on-chain**, the identical trap as before
(`HostError: Error(Auth, InvalidAction)`, `VM call trapped:
UnreachableCodeReached` inside `__check_auth`). Soroban's atomicity
guarantee held: a failed invocation rolls back completely, confirmed by
re-reading balances after the fact, not just trusting the "no error"
absence, so nothing was lost beyond the network fee.

Isolated once more against the same minimal `probe` contract from the
`Signer::Delegated` round (single context this time, the simplest
possible construction): the identical trap.

**Conclusion, stated plainly: `Signer::Delegated` vs. `Signer::External`
is ruled out as the actual differentiator for this build's own
construction.** Both signer types trap identically here, which means the
two external implementations that work with `External` elsewhere don't
automatically transfer, something else in this build's own transaction
construction still differs from theirs, not yet found. The Signer
encoding itself is now proven correct by direct on-chain comparison, so
that specific piece is no longer a live suspect.

### One more isolation round: `Client.from(...).methodName()` vs. building `AssembledTransaction` directly

The one remaining structural difference between this build's construction
and the pattern used by every outside reference point consulted:
this build calls the generated `Client.from({contractId,
...}).methodName(...)` convenience wrapper throughout, never
`AssembledTransaction.build({contractId, method, args, ...})` directly.
`Client`'s generated methods are documented to delegate to
`AssembledTransaction.build` underneath, so this was not expected to
matter, but it was the one remaining untested variable after ruling out
signer type, encoding method, nonce reuse, nested-entry presence, SDK
version alignment, and target-contract complexity.

Retried once, against the same minimal `probe` contract, everything else
held constant: `probe.ping({caller: smart_account})` built via
`AssembledTransaction.build(...)` directly instead of
`Client.from(...).ping(...)`, same `Signer::External` construction, same
`authorizeEntry` signing. **Identical trap**
(`HostError: Error(Auth, InvalidAction)`, `VM call trapped:
UnreachableCodeReached` inside `__check_auth`). `Client.from` vs. direct
`AssembledTransaction.build` is now also ruled out.

This closes this diagnostic round, per its own stated scope: seven
specific hypotheses tested and ruled out (hand-built vs. spec-driven
encoding, nonce reuse, nested-entry presence, `AuthPayload` content,
`soroban-sdk` version alignment, target-contract complexity, signer type
`Delegated` vs. `External`), plus signer encoding independently confirmed
byte-correct against live on-chain state, plus the transaction-building
API surface itself (`Client.from` vs. `AssembledTransaction.build`). The
trap remains unexplained. Further attempts, if warranted, get their own
separately-scoped investigation rather than continuing to stack onto this
one; `OpenZeppelin/stellar-contracts#839` carries the full picture as of
this update.

## `routeTemplate` for opaque-origin schemes: deliberately left unbuilt, on a reviewer's own reasoning

`x402-foundation/x402#3138`'s fix (the opaque-origin canonical-URL
stripping, closing
[#3121](https://github.com/x402-foundation/x402/issues/3121)) only
covers the raw-URL branch. The `routeTemplate` branch (dynamic,
parameterized routes) still only applies to WHATWG special schemes; an
opaque scheme like `mcp://` never takes it, even if a producer someday
declares a templated MCP tool URL.

This is not an oversight left unfiled. whawk46, the same reviewer who
found the query-stripping gap and whose suggested shape closed it,
raised it directly and gave the reasoning for leaving it unbuilt,
quoted verbatim from the PR thread: "I'd leave it unpinned,
deliberately. The mechanical form is obvious whenever it's needed —
protocol + host + template, same shape as this commit — but whether
collapsing templated tools into one canonical is even the right catalog
semantics for a non-special scheme is a question I'd rather answer with
a real producer in hand than by guessing ahead of one. The first time
someone declares a template on an opaque scheme, it's a five-line PR
with a test, and this thread is the paper trail for where it goes."

Recorded here for the same reason the thread itself exists: not a gap
in Periplo's own work, and not something to build ahead of a real need,
on a reviewer's own explicit call, not this project's guess. If a real
opaque-scheme `routeTemplate` producer shows up, the fix is small and
already sketched (`protocol + host + template`, the same reconstruction
`#3138` already uses for the raw-URL branch) and belongs in
`@x402/extensions/bazaar` itself, following the same "don't reimplement
the wire protocol" principle every other upstream-facing piece of this
project already follows.

## A design note for any future usage-based ranking signal: wash-trading resistance has to be designed in, not added after

Not a gap in what's built today. `packages/search`'s ranking is purely
metadata-based: `periplo_hybrid_search`
(`supabase/migrations/20260812080000_search.sql`) scores on lexical
relevance (`ts_rank_cd` over `fts`) and semantic similarity (`embedding
<#> query_embedding`) fused by RRF, confirmed directly in the SQL, not
assumed: no payment amount, volume, buyer count, or usage figure
appears anywhere in the scoring formula. There is nothing to
wash-trade today, since the ranking never looks at payments at all.

Worth writing down anyway, since the temptation to add a
usage-based credibility signal (payment volume, buyer diversity, a
low observed failure rate) is an obvious future direction for search
quality, and the wash-trading resistance for it is much cheaper to
design in from the start than to retrofit once real listings depend on
the ranking behaving a certain way:

- Payer diversity, discounted for shared funding origin, not raw
  payment count. A resource paid for many times by the same buyer, or
  by buyers funded from the same source, should not score as more
  credible than one paid for by genuinely independent buyers a few
  times.
- Keep any credibility score separate from the relevance score, never
  folded into one number. A padded credibility signal must never be
  able to outrank a genuinely more relevant result on its own; the two
  need to compose in a way that keeps that bound obvious, not just
  likely.

Not a decision made now, since there is no usage signal to secure yet.
Recorded here so the next session that adds one starts from this list
instead of rediscovering it after the ranking is already live and
harder to change.

## A skill for skills.stellar.org, deliberately after Phase 7, not before

A skill for skills.stellar.org, deliberately after Phase 7 (MCP
discovery server), not before: without it, there is not yet enough to
teach an agent. Today's surface is facilitator and Bazaar APIs only,
thin next to what an agent actually wants to do, discover and pay for
an x402 service with no prior integration, which is what Phase 7
exists to make possible. A sequencing decision, not an oversight.

## Fly.io redeploy blocked, then resolved: this session's CLI auth couldn't see `periplo-testnet`

The new `GET /discovery/resources`/`GET /discovery/search` routes and the
repo-wide em-dash cleanup (committed and pushed, `70b7c20`/`93df21e`/
`d29f0fd`) were not live on `https://periplo-testnet.fly.dev` at first.
`fly deploy --config fly.facilitator.toml --dockerfile Dockerfile.facilitator
-a periplo-testnet` failed with `Error: unauthorized`, and `fly status -a
periplo-testnet` failed harder, `Could not find App "periplo-testnet"`, not
just a permission denial. `fly auth whoami` confirmed this session was
authenticated as `xvaiosx7@gmail.com`; `fly apps list` under that account
did not include `periplo-testnet` at all. The app was provisioned under a
different Fly.io account than that CLI session, a genuine credential gap.
Logged rather than worked around, per this project's own rule for a
genuinely blocked, outward-facing action.

**Resolved the same day**: the project owner logged into the correct Fly
account (`ticketsafes@gmail.com`, confirmed via `fly apps list` showing
`periplo-testnet`) and the redeploy was run for real. `fly deploy` itself
printed a false-positive warning ("app is not listening on the expected
address... 0.0.0.0:8402"), not trusted at face value: verified live
instead with real `curl` requests against all three routes.
`GET /` returns the updated `endpoints` map (including the two new
discovery routes) and the em-dash-free description; `GET /discovery/resources`
returns the real single-row catalog with the correct wire shape;
`GET /discovery/search?query=financial` returns a valid empty result
(200, correct shape, no match for that specific query against the one
real row, not an error). All three checked directly against the live
service, not assumed from the deploy command's own success output.

## Fly.io redeploy blocked again, same recurring gap: real external QA fix (2026-08-19), resolved same day

The write-time URL gate, the `null/*`/`localhost` backfill migration, and
`apps/facilitator/src/demo-resource.ts` (the one real, externally-reachable
demo resource, spec'd in CLAUDE.md's Architecture section) are all built,
tested (`pnpm run ci` green, 217 tests), and typechecked. The backfill
migration itself already ran for real against the live Supabase project
(confirmed by re-querying the table). What's still blocked: getting
`demo-resource.ts` actually deployed to `https://periplo-testnet.fly.dev`
and running a real settled payment against it, the same "cataloging only
counts once it happens for real, not just once the code exists" standard
this project holds everything else to.

Blocked the same exact way as the entry above, same root cause recurring:
`fly auth whoami` in this session resolves to `xvaiosx7@gmail.com`, `fly
secrets list -a periplo-testnet` fails `unauthorized`, `periplo-testnet`
lives under `ticketsafes@gmail.com` specifically. Logged rather than
routed around, per this project's own rule for a genuinely blocked,
outward-facing action; not attempting to hunt for a workaround credential.

**Resolved the same day**: the user re-logged into the correct Fly account
(`ticketsafes@gmail.com`, confirmed via `fly auth whoami` and `fly apps
list` showing `periplo-testnet`) and asked to finish the deploy. All four
steps above were run for real, in order, and hit two further real bugs
along the way (both root-caused and fixed before the settlement that
finally worked, both written up in full in CLAUDE.md's Architecture
section rather than duplicated here): the demo route's own `resource.url`
came out `http://...` instead of `https://...` behind Fly's
TLS-terminating proxy (`@hono/node-server` has no `X-Forwarded-Proto`
awareness, confirmed by reading its source), fixed with an explicit
`DemoResourceConfig.baseUrl` overriding the SDK's request-derived URL;
and the first two real settlement attempts failed with
`invalid_exact_stellar_payload_fee_exceeds_maximum`, real testnet Soroban
fees (~72,000 stroops that day) exceeding `@x402/stellar`'s inherited
50,000-stroop default ceiling, fixed with a new
`MAX_TRANSACTION_FEE_STROOPS=200000` Fly secret. The real settlement that
finally succeeded: transaction
[`dde62ac5e6...`](https://stellar.expert/explorer/testnet/tx/dde62ac5e67730a0751052a2dafc67dffc595df20bacbae9aaa1c758081deaea),
Horizon-verified, recorded in `conformance/RESULTS.md`. The catalog now
holds `https://periplo-testnet.fly.dev/demo/temperature-convert`,
confirmed via `GET /discovery/resources` against the live deployment, not
just from the script's own printed success output.

## `docs/SPEC.md` §11's pre-submission dependency re-verification ran 8 days late, not before submitting

Spec §11 is explicit: "before submission, re-verify each pinned version
and state the verification date in the README." The manifest was
verified once, 2026-08-07, four days before the actual 2026-08-11
submission, and the required second pass never happened before
submitting. README's own "Dependency versions" section said so plainly,
in its own words, for the full 8 days after submission until this was
caught: "That pass has not happened yet." A real, unforced miss against
the project's own stated requirement, not something the panel would need
to find on its own.

**Run for real 2026-08-19**, prompted by an external audit against this
project's own `docs/SPEC.md` §13 checklist. Every pinned package
re-checked against the live npm registry / crates.io, not assumed
current from memory. Real findings, not a clean bill of health rubber-
stamped: `pnpm` moved two minor versions (11.20.0 → 11.22.0), several
patch/minor bumps across `vitest`/`@biomejs/biome`/`hono`/`@types/node`/
`tsx`/`@supabase/supabase-js`, all applied and the full gate re-run green
after (`pnpm run ci`, 218 tests). This caught a real, separate bug along
the way: `eval/package.json` had its own stale `@supabase/supabase-js`
pin that the workspace's other packages didn't share, producing a type
mismatch (`protected supabaseUrl` on two nominally different classes)
only visible once the version actually diverged across the workspace,
not caught by any single package's own typecheck in isolation.

Two packages deliberately were not bumped to the literal latest
available, both judgment calls made and stated, not silent gaps:
`@x402/core`'s family stayed at 2.22.0 rather than the actual latest
2.23.0, held back specifically because `pnpm`'s own `minimumReleaseAge`
supply-chain policy flagged 2.23.0 as under 24 hours old at check time,
with no changelog available to review what changed in the package this
project's real (if testnet-only) fee-sponsor signs through; and
`soroban-sdk` stayed at 27.0.5 rather than 27.0.6 (a plain patch bump),
because the already-deployed `UptoSettlement` contract was built and
verified against 27.0.5 specifically, and bumping the source pin without
redeploying would leave the repo and the live contract mismatched, while
redeploying a new instance is a bigger action than a version bump and
wasn't asked for. Full reasoning and the corrected `stellar-xdr` table
entry (was `28.0.0`, a value that was wrong from the start, not drifted;
the real, transitively-resolved version is `27.0.0`, confirmed by
reading `Cargo.lock` directly) are in `docs/SPEC.md` §2.

Deliberately not redeployed to `periplo-testnet.fly.dev` as part of this
pass: the live facilitator keeps running against the previously pinned
`@x402/core` family until a real redeploy is asked for separately, same
"local change and a live redeploy are two different actions" boundary
already applied elsewhere in this file.

## Search relevance floor: fixed for real, but not fully, and a global cosine cutoff turned out to be the wrong shape of fix

A live user re-testing search against `periplo-testnet.fly.dev` (with
only two rows in the catalog at the time: the demo `temperature-convert`
HTTP resource and a stale MCP row cataloged back in Phase 4, before Phase
5's embedding pipeline existed) found that `GET /discovery/search`
returned `temperature-convert` for essentially any query string,
including `weather+forecast` and `financial_analysis`, always with
`partialResults: false`. Reproduced independently against the live
deployment before touching any code, not just trusted from the report.

Root-caused to two separate, stacked bugs, both confirmed directly
against the real live database with a raw `pg` connection before fixing
anything, not assumed from reading the SQL:

1. The `fts` generated column (`supabase/migrations/
   20260807202307_resources.sql`) only ever indexed `description` and
   `parameters`. The stale MCP row has `description: null` (the payment
   that cataloged it in Phase 4 never carried one), so its `fts` was an
   empty tsvector, unsearchable by any query, including its own literal
   tool name. Fixed by folding `tool_name`/`route_template` into the
   indexed text (`supabase/migrations/
   20260820100000_search_relevance_floor.sql`), and into
   `buildDiscoveryText` (`packages/search/src/discovery-text.ts`) for
   future embeddings too, so a thin listing is still findable by its own
   identity. The stale row's embedding was also backfilled from its
   (loosened) tool name via a one-off script, real code run against the
   live project, not a fabricated description.
2. `periplo_hybrid_search`'s semantic leg had no similarity floor at all:
   it returns the nearest embedded rows by `<#>` distance unconditionally,
   so with only one embedded row in a small catalog, that row was
   "nearest" (and therefore returned with a nonzero RRF score) for any
   query, relevant or not.

The second bug is the one that turned out to be genuinely hard, and the
first attempt at fixing it was wrong in a way worth recording rather than
quietly overwriting. A floor of 0.8 cosine similarity, calibrated against
real measurements of the one demo resource's own description (weather
forecast: 0.764, financial_analysis: 0.685, versus true matches like
"temperature conversion" at 0.870), was pushed live in
`20260820100000_search_relevance_floor.sql` and cleanly separated true
from false matches *for that one resource*. Re-running `pnpm eval` (the
real Phase 5 gate, 55 resources, 300 graded queries) against the migrated
database immediately showed why that calibration didn't generalize:
nDCG@10 collapsed from the committed baseline 0.9346 to 0.4632, a 50.4%
regression. Measuring the same model against `eval/golden.jsonl`'s own
372 real query/relevant-fixture pairs showed true-positive cosine
similarities ranging down to 0.625, with the graded-relevant (grade >= 2)
subset still as low as 0.678, both well inside the 0.6-0.8 band the
demo-resource calibration had treated as a clean cutoff.

There is no single global cosine floor that both preserves that real
recall and suppresses every false positive the original report
demonstrated: real true positives and the reported false positives
occupy overlapping ranges of the same model's raw similarity output, a
genuine property of BGESmallENV15's anisotropy on short text, not a
tuning miss fixable with a better constant. Corrected the default to 0.6
(`supabase/migrations/20260820110000_fix_semantic_floor_regression.sql`),
just under the real measured minimum true positive, verified back to
zero regression with a second real `pnpm eval` run. That default closes
the most degenerate case (a near-empty catalog returning any embedded row
for any query at all) and the `financial_analysis` reproduction (now
correctly returns the MCP resource, via the lexical fix above, ranked
alongside rather than hidden behind the semantic false positive). It does
**not** fully close the `weather forecast` reproduction: that query's
0.764 similarity to the demo resource sits well above 0.6, so
`temperature-convert` still appears for it, live, confirmed after the
fix. Left open on purpose rather than tuned back down to hide it: the
real fix for that case is architectural (RRF's `1/(k+rank)` fusion is
magnitude-blind by design, so it can't distinguish "the nearest of many
at 0.87" from "the nearest of one at 0.68"), not a constant, and is worth
its own scoped design pass once the catalog has enough real, non-fixture
resources to calibrate a magnitude-aware signal against.
