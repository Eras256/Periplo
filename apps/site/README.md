# @periplo/site

Source for periplo.xyz: the project site (landing, legal pages, security
page) plus the UptoSettlement demo at `/demo`. Stellar testnet only. This
is the project site, not the Phase 9 developer hub (`apps/hub`, spec §10,
not started).

`apps/upto-demo` stays untouched: it is the source of the deployment
submitted to GOYA HACK. This app carries its own copy of the demo logic
(`src/demo/`), translated to both languages, so that deployment never
changes underneath the submission.

## Why Next.js and not the Vite setup of `apps/upto-demo`

- **One indexable URL per language.** Every page is prerendered under
  `/en/...` and `/es/...`, with `hreflang` alternates, `x-default` and a
  sitemap listing both. A client-side SPA cannot give search engines
  per-language HTML. (Kumply uses the same `[locale]` folder but with
  `localePrefix: 'never'`, which serves both languages from one URL; this
  site does not.)
- **Live facilitator status without CORS.** `periplo-testnet.fly.dev`
  sends no `Access-Control-Allow-Origin`, so a browser cannot read
  `/supported` or `/status` directly (found checking with an `Origin`
  header; `curl` alone hides it). `src/app/api/facilitator/route.ts`
  reads both server-side, whitelists the fields
  (`src/lib/facilitator-status.ts`), and is cached at the CDN for 30 s so
  visitors never multiply load on the one-machine deployment.
- No i18n library: dictionaries in `messages/*.json` plus a tested
  `Accept-Language` negotiator (`src/i18n/config.ts`), the pattern from
  Next's own internationalization guide.

## Where each piece of content comes from

| Section | Source | Refresh |
| --- | --- | --- |
| Evidence | `src/data/evidence.ts`, a subset of `conformance/RESULTS.md` plus the GOYA HACK demo's settlement | By hand, with the source doc |
| Live status | Facilitator `/supported` and `/status`, via `/api/facilitator` | Every page view (30 s CDN cache) |
| Upstream contributions | `src/data/upstream.json`, generated from the GitHub API | `pnpm --filter @periplo/site snapshot:upstream` |
| Demo, real settlements | Soroban RPC `getEvents` for `CA7OYVXW...V6TW`, from the browser | Every 30 s while visible |
| Legal pages | `content/legal/{en,es}/*.md`, written against the code | By hand |

Which upstream items count as Periplo's is decided in
`scripts/snapshot-upstream.mjs`, not inferred from the `Eras256` author
field (that identity is shared with other projects).
`OpenZeppelin/stellar-contracts#840` is excluded on purpose: the
maintainer showed the finding was wrong.

## Brand assets

`public/brand/logo-lockup-{dark,light}.svg`, `public/og.png` (the
bilingual 1200x630 social banner), `src/app/icon.svg`, `favicon.ico` and
`apple-icon.png` come unmodified from the Periplo branding pack
(2026-09-27). The pack's colors are not to be changed, so the navbar and
footer swap between the light and dark lockup files per theme instead of
recoloring one, and the lockup is never shown below the pack's tested
32 px minimum. The wordmark is Space Grotesk (SIL OFL 1.1) already
converted to outlines in the SVGs: no font file ships with the site and
nothing is added to the npm dependency graph.

## Commands

```
pnpm --filter @periplo/site dev                 # http://localhost:3000
pnpm --filter @periplo/site build
pnpm --filter @periplo/site start               # serve the production build
pnpm --filter @periplo/site snapshot:upstream   # refresh src/data/upstream.json (needs gh)
```

Type checking runs through the root `tsc -b` (the build skips Next's own
checker, which does not drive TypeScript 7); tests run through the root
`vitest`.

## Deploying (from the project owner's Vercel account)

Tested on Vercel: deployed as `periplo-site.vercel.app` (project
`periplo-site`, root `apps/site`) on 2026-09-27. The build log showed pnpm
11.22.0 through corepack and no `sharp` install. The repo-root
`vercel.json` belongs to `apps/upto-demo`'s project; Vercel reads
`vercel.json` from the project's root directory, so it does not apply here.

- Framework preset: Next.js. Root directory: `apps/site`.
- Install and build: leave Vercel's defaults (`pnpm install`,
  `pnpm build`).
- Environment variable: `ENABLE_EXPERIMENTAL_COREPACK=1`, so Vercel uses
  the `pnpm@11.22.0` pinned in the root `package.json`.
- Environment variables for the real settlement at `/demo` (route
  `src/app/api/demo/settle/route.ts`, Stellar testnet only). All are
  server-side; none may ever carry the `NEXT_PUBLIC_` prefix:
  `DEMO_BUYER_SECRET`, `DEMO_SUBMITTER_SECRET`, `DEMO_RATE_PEPPER`,
  `DEMO_SELLER_PUBLIC`, and optionally `DEMO_GLOBAL_DAILY_LIMIT` (default
  40, at most 150) and `DEMO_VISITOR_DAILY_LIMIT` (default 5). Without the
  four required ones the route answers `demo_unavailable` and the page falls
  back to the in-browser simulation.
- Domain: `periplo.xyz`. The site redirects `/` to `/en` or `/es` from the
  visitor's language, so no apex rewrite is needed.
- Leave Vercel Web Analytics and Speed Insights off unless the privacy
  page is updated first: it currently states the site loads no analytics.

## Real settlement at /demo

`POST /api/demo/settle` takes only a ceiling and a token count, validates
them on the server, prices the usage itself (100 base units per token) and
settles `min(cost, ceiling)` in testnet USDC against the demo
`UptoSettlement` contract. The buyer is a dedicated project test account
that signs the ceiling; a separate account submits the transaction and pays
the fee (XLM only; the route refuses to run if it holds any asset, has
another signer, or equals the buyer or seller). The hash is returned only
after the transaction is confirmed and its `settled` event has been read
back and matches the request.

- Limits: at most 0.10 USDC per settlement; a rolling 24 h global cap and a
  per-visitor cap, both counted from the submitter account's own
  transactions on Horizon (the ledger is the counter, so it survives cold
  starts and is shared across instances). Soroban transactions cannot carry
  a memo, so the visitor tag (16 bytes of an HMAC of the connecting address,
  keyed by `DEMO_RATE_PEPPER`) is the first half of the authorization nonce.
  The address itself is neither stored nor logged by the route. Reads and
  writes are best-effort across instances: a burst hitting several cold
  instances at once can overshoot a cap by the number of concurrent requests.
- Serialisation: one settlement at a time per instance (bounded queue);
  across instances a `tx_bad_seq` is retried with a fresh sequence.
- Time: `maxDuration = 60` (Hobby limit); the work budget is 50 s. A
  transaction submitted but not confirmed in time is reported as
  `unconfirmed`, its hash goes to the function log and no hash is shown.

## Before the first public deploy

- [ ] Giovanny decides who is responsible and how to contact them, then
      replaces the first section of `content/legal/{es,en}/privacy.md` (it says
      no one is designated yet and points to the public issues page) and the
      site footer's "Periplo contributors". Nothing there may be invented.
- [ ] Confirm the facts the privacy page cannot get from the code: how
      long Fly.io keeps the facilitator's logs, and whether the Vercel
      project has analytics or log drains enabled.
- [ ] Legal review. The legal pages describe what the code does; they
      cite no law and have not been reviewed by a lawyer.
