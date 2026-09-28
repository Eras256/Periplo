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

Not yet tested on Vercel itself; verified locally with `next build` and
`next start` in a real browser.

- Framework preset: Next.js. Root directory: `apps/site`.
- Install and build: leave Vercel's defaults (`pnpm install`,
  `pnpm build`).
- Environment variable: `ENABLE_EXPERIMENTAL_COREPACK=1`, so Vercel uses
  the `pnpm@11.22.0` pinned in the root `package.json`.
- No other environment variables or secrets.
- Domain: `periplo.xyz`. The site redirects `/` to `/en` or `/es` from the
  visitor's language, so no apex rewrite is needed.
- Leave Vercel Web Analytics and Speed Insights off unless the privacy
  page is updated first: it currently states the site loads no analytics.

## Before the first public deploy

- [ ] Enable private vulnerability reporting on `Eras256/Periplo`
      (repository settings, owner only; checked 2026-09-27: disabled),
      then set `PRIVATE_REPORTING_ENABLED = true` in
      `src/app/[locale]/security/page.tsx`. Until then `/security` says
      the channel is pending, and `security.txt` points to that page.
- [ ] Confirm the facts the privacy page cannot get from the code: how
      long Fly.io keeps the facilitator's logs, and whether the Vercel
      project has analytics or log drains enabled.
- [ ] Legal review. The legal pages describe what the code does; they
      cite no law and have not been reviewed by a lawyer.
