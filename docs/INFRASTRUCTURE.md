# Infrastructure: what runs where, and who pays for it

`docs/SPEC.md` §11 asks for this stated explicitly. Real, current state,
checked against the actual configs and live services, not a target
architecture.

## What's actually running today

| Service | What | Where | Config |
| --- | --- | --- | --- |
| Facilitator (`apps/facilitator`) | `verify`/`settle`/`supported`, automatic Bazaar cataloging, `GET /discovery/*`, the demo resource | Fly.io, app `periplo-testnet`, region `iad`, `stellar:testnet` only | [`fly.facilitator.toml`](../fly.facilitator.toml): `shared-cpu-1x`, 512MB, 1 machine, `min_machines_running = 1` (never scales to zero, spec §8's latency SLO) |
| Catalog database | `resources` table, full-text + vector indexes, RLS | Supabase (managed Postgres + pgvector) | [`supabase/config.toml`](../supabase/config.toml), schema in [`supabase/migrations/`](../supabase/migrations) |
| Repository, CI | Source, `.github/workflows/ci.yml` | GitHub, `Eras256/Periplo` (public) | Free for a public repository |
| Contracts | `UptoSettlement`, `agent-verifier`, `agent-smart-account` | Stellar `testnet`, no separate hosting, they're on-chain | Deployed via the `stellar` CLI, addresses in `conformance/RESULTS.md` and `docs/DEFERRED.md` |

**Not running:** `periplo-mainnet` (no mainnet fee-sponsor key exists
yet, `docs/DEFERRED.md`), the developer hub (`apps/hub`, Phase 9, doesn't
exist), the MCP discovery server (`packages/mcp`, Phase 7, doesn't
exist yet either). `GET /status` (uptime, latency, error rate, catalog
size, last settled transaction per network) has been live since
2026-09-03, corrected here from an earlier "telemetry doesn't exist yet"
claim that outran the real work.

## Commit running in production

The facilitator on `periplo-testnet` runs commit
[`09ecfd8`](https://github.com/Eras256/Periplo/commit/09ecfd8bad00ac4ad6ea4d42ed28ec47dd0eae5c),
Fly release `v20` (2026-09-27, CDMX evening), replacing `v19` (2026-09-11).
It was built from a clean checkout of that exact commit with the command in
`docs/DECENTRALIZATION.md`, no secrets or configuration changed. The code the
image ships differs from `v19` only in comments, so the wire behaviour is
unchanged: `GET /supported` is byte-identical before and after (`exact` on
`stellar:testnet`, `areFeesSponsored: true`, the `bazaar` extension, the same
four fee-payer accounts), and `upto` is still not advertised on this
deployment.

Checked after the deploy, not assumed: `GET /health` returns 200; a real
`exact` settlement against `/demo/temperature-convert`
([`4aec2ca9...`](https://stellar.expert/explorer/testnet/tx/4aec2ca95afaed11bb4cf5de21eebe05d247a4b9b60ead64acf4ae99cd95d75c))
is `successful: true` on Horizon with the primary fee-sponsor as source
account; the catalog holds the same three resources as before; and
[periplo.xyz/es](https://periplo.xyz/es) and `/es/demo` render the live
status and the settlements in a real browser. The four fee-payer accounts hold
only native XLM on Horizon, which is what the boot-time non-custodial check
(`apps/facilitator/src/boot-safety.ts`) enforces for every configured signer.

`GET /status` restarts from zero on every deploy (uptime, request counts and
last settled transaction are in memory only, see
`apps/facilitator/src/telemetry.ts`), so its
counters are not comparable across releases.

Update this section on every redeploy. The commit that runs is not
necessarily `HEAD` of `main`: a later commit that touches only `apps/site`
or the docs does not change what the facilitator serves.

## Who pays, right now

The project owner, during the build. There is no revenue: the
facilitator charges no fee of its own beyond the network fees it
sponsors for buyers (`extra.areFeesSponsored: true`), and `stellar:testnet`
transactions cost nothing real (Friendbot-funded). The real, ongoing cost
today is the Fly.io machine and the Supabase project tier, both
currently covered directly by the project owner, not by the SCF grant.

## After the grant: not yet decided, stated honestly rather than guessed

There is no committed sustainability plan for who funds
`stellar:pubnet` hosting, a `periplo-mainnet` Fly app, or the Supabase
project's ongoing tier once the SCF grant (if awarded) runs its course.
This is a real, open gap, not filled in here with an optimistic answer
this project can't back up:

- A mainnet deployment adds real cost (its own Fly app, per §8's `never
  both networks on one app` isolation rule) that testnet's Friendbot
  funding doesn't need to cover.
- The facilitator sponsors network fees for every settled payment; at
  real (non-testnet) volume, that's a genuine, non-trivial ongoing
  Stellar fee cost, not something the current testnet-only deployment
  has ever had to absorb.
- No pricing model, subscription, or revenue mechanism exists in the
  code today. `docs/SPEC.md` §5 explicitly allows self-hosters to set
  their own mainnet pricing model (never hard-wired), but Periplo's own
  hosted instance hasn't chosen one.

Per spec §12's own working rule (trust reality, don't stall, note the
gap and continue): this is logged as a real open decision the project
owner needs to make, not something resolved by this document asserting
an answer it doesn't have evidence for.
