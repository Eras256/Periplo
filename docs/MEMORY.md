# Memory — repo-level decision log

> This is a **committed, human-readable** log of decisions and context for
> this repository — distinct from Claude's own out-of-repo persistent
> memory (`~/.claude/projects/-home-vaiosvaios-Periplo/memory/` on the
> machine these sessions run on, indexed by its own `MEMORY.md`, not part
> of this git history). That system-level memory is where Claude keeps
> facts like "this user prefers X" across unrelated sessions; this file is
> where *this project's* non-obvious decisions live so anyone (human or a
> future Claude session) reading the repo — not just the one machine with
> that memory directory — has them. If the two ever disagree, this file is
> the one that travels with the code and wins.
>
> Append entries chronologically; don't rewrite history here — if a
> decision was later reversed, add a new entry saying so rather than
> editing the old one out. `docs/DEFERRED.md` is the companion file for
> *what wasn't built and why*; this one is for *why things were built the
> way they were*.

## 2026-08-06/07 — Phase 0

- **Governing spec persisted to `docs/SPEC.md`.** It previously existed
  only in the chat session that kicked off the build. Committing it was a
  precondition for any of this being resumable from a fresh session —
  `CLAUDE.md` points to it, but a pointer to nothing is useless.
- **`packages/licence-check` scopes its hard gate to the production
  dependency graph (`pnpm licenses list --prod`), not the full graph.**
  First real run caught `vitest@4.1.10 → vite@8.2.0 → lightningcss`
  (MPL-2.0, a hard, non-optional dependency of vite — confirmed by reading
  vite's own `package.json`, not assumed). Rather than weakening the
  classifier to pass, or hard-failing over a devDependency-only tool that
  spec §1's own goal (no copyleft obligation reaching an *operated*
  service) doesn't actually apply to, the check now runs twice: `--prod`
  as the blocking gate, full graph as a non-blocking warning. Full
  reasoning in `packages/licence-check/src/cli.ts` and `docs/DEFERRED.md`.
- **Node 20→22 fixed at the toolchain, not worked around in code.**
  `pnpm@11.20.0` (spec-pinned) hard-requires Node ≥22.13 — it imports
  `node:sqlite`, so it doesn't just warn on Node 20, it crashes. `nvm` was
  already present on the machine (unaliased); installed Node 22.23.2 via
  `nvm install 22`, set `nvm alias default 22`, added `.nvmrc`. Considered
  downgrading the pnpm pin instead — rejected, since the spec's pin was
  already verified live against the npm registry and matching it is the
  point.
- **Raven MCP connected but not authenticated.** Added via
  `claude mcp add --transport http stellar-raven "https://raven.stellar.buzz/mcp"`
  (command sourced from the `standards` skill). Reports "Needs
  authentication" — an interactive sign-in this non-interactive session
  can't complete. Substituted direct `WebFetch`/registry/live-endpoint
  checks for Phase 0's fact-verification needs; whoever runs the next
  *interactive* session should complete the sign-in.
- **GitHub remote (`Eras256/Periplo`) was already configured before this
  session touched anything**, and `gh` was already authenticated. Verified
  it was genuinely empty (`gh repo view --json isEmpty` → `true`,
  `git ls-remote origin` → nothing) before treating a push as safe — did
  not assume emptiness from the fact that the local working tree was
  empty at session start.
- **CLAUDE.md / SKILLS.md / ECOSYSTEM.md / this file were added in a
  follow-up housekeeping pass**, not as part of the master spec's own
  Phase 0 deliverable list (`docs/SPEC.md` §11 doesn't name any of them).
  Added because they're what make the rest of the build resumable and
  auditable across sessions, not because the spec required them — noted
  here rather than silently expanding "Phase 0 scope" in `docs/SPEC.md`
  itself, per the "no invented scope, but log what's added and why" spirit
  of spec §12 rule 5.
- **`docs/ECOSYSTEM.md` is a partial, truncated snapshot** (the LumenLoop
  catalogue paste that started the session cut off mid-list at 50,000
  characters). Committed as-is rather than fabricating the missing
  entries — flagged inline as needing regeneration before it's relied on
  for the actual SCF submission's differentiation section.

## 2026-08-07 — Phase 1

- **`checkRouteTemplate` decodes with a bounded loop (8 iterations) and
  treats non-stabilisation as a rejection in its own right**, not just a
  practical DoS guard. Verified empirically (not assumed) exactly how many
  decode passes different encoding depths need before choosing the bound:
  triple-nested `%25`-wrapped traversal stabilises within 8 passes and is
  still correctly caught as traversal; one layer deeper (9 passes) hits the
  bound and is rejected as "exceeds maximum percent-encoding depth" without
  ever getting to see what's underneath. A legitimate `routeTemplate` never
  needs that much nesting, so treating the depth itself as the signal
  doesn't cost any real functionality.
- **Added a CR/LF rejection to `checkRouteTemplate`** beyond what spec
  Phase 1's text explicitly enumerates (traversal / absolute / protocol-
  relative / backslash / null byte / malformed encoding). Justified by
  spec §6's broader injection-via-metadata concern (header/log injection if
  a template is ever reflected unescaped) — a small, cheap addition, not
  scope creep into something spec §12 rule 5 would need a deferral note
  for, since it's strictly a hardening of the same function, not new
  surface area.
- **`softDropFields` was built schema-agnostic on purpose.** Phase 1's
  text says "soft-drop extraction" without defining the discovery-payload
  schema — that's explicitly Phase 4's job ("validate `info` against the
  supplied schema"). Building `softDropFields` as a generic
  `(raw, rules) -> {kept, dropped}` mechanism now, with field rules
  supplied by the caller, means Phase 4 wires in the real schema later
  without this package needing to change.
- **`routeTemplate` is deliberately excluded from soft-drop.** It's the
  catalog key; an invalid one means there's no valid listing to keep
  fields *of*, so it hard-rejects via `checkRouteTemplate` before
  soft-drop ever runs. Documented explicitly in both modules' doc comments
  so this isn't rediscovered as a "bug" later (a routeTemplate silently
  passing through soft-drop would be the trust-boundary failure Phase 1
  exists to prevent).
- Gate: `pnpm install && pnpm typecheck && pnpm lint && pnpm test` exits 0;
  70 tests total, 45 covering `checkRouteTemplate` alone (gate requires
  ≥20). Committed and pushed.

## 2026-08-07 — Phase 2

- **Real Supabase project provisioned mid-session** (user supplied
  credentials directly). Handling and the rotation note are in
  `docs/DEFERRED.md`, not repeated here — this section is about the schema
  design decisions.
- **Migrations went through the pooler (port 6543), not the direct
  connection (port 5432)** — the direct host is IPv6-only and this sandbox
  has no IPv6 egress. Verified with a plain `curl -6` test before
  concluding it was an environment limit rather than a Supabase network
  restriction. See `docs/DEFERRED.md` for the full finding.
- **Two proactive deviations from the spec's literal SQL**, both applied
  *before* attempting the migration rather than discovered by a failed
  push — reasoned about known PostgreSQL behavior first, then verified
  empirically that the fix worked: (1) `to_tsvector('english', text)` is
  STABLE not IMMUTABLE, so the `fts` generated column wraps it in a
  project-local IMMUTABLE SQL function (`periplo_fts`); (2) plain
  `unique (url, route_template, tool_name)` doesn't dedupe when either of
  the last two columns is NULL (standard SQL: NULL ≠ NULL), so the
  constraint uses `unique nulls not distinct` (PG15+) instead. Both are
  documented inline in the migration SQL itself, not just here.
- **RLS policy alone wasn't enough — needed explicit grants too.**
  Supabase's current default doesn't auto-expose new tables to the
  `anon`/`authenticated` Data API roles; without `grant select on
  resources to anon, authenticated`, the RLS policy would have been
  unreachable dead code (PostgREST denies at the grant level first).
  Caught by reading `supabase/config.toml`'s own generated comment about
  `auto_expose_new_tables`, not by trial and error.
- **Verified the whole RLS design twice**: once by hand with raw `curl`
  against the PostgREST REST API (anon SELECT 200, anon INSERT 401 with
  an RLS-violation code, service-role INSERT 201) *before* investing in
  writing the TypeScript test suite, then again as an automated,
  repeatable `vitest` integration suite
  (`packages/bazaar/src/db/resources.integration.test.ts`) that runs for
  real against the live project — gated on `SUPABASE_URL` /
  `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` being present (via
  Node's built-in `process.loadEnvFile()`, no `dotenv` dependency added)
  so it skips cleanly rather than failing on a fork or a secrets-less
  environment. Every test that inserts a row cleans it up via the
  service-role client in `afterEach`.
- **A real TypeScript/postgrest-js gotcha cost the most time this phase**:
  declaring the Supabase `Database`/`ResourceRow` types as `interface`
  instead of `type` silently collapsed every query's inferred type to
  `never` (not a type error — a silent wrong-type resolution). Diagnosed
  with an isolated, disposable repro file using hand-written conditional
  types mirroring postgrest-js's internals, deleted once the cause was
  confirmed, not left in the codebase. Full explanation in
  `docs/DEFERRED.md` and inline in `client.ts` — worth remembering before
  writing any future generated-types file for this project.
- Gate: `pnpm install && pnpm typecheck && pnpm lint && pnpm test` exits 0
  against the real Supabase project; 78 tests total (70 after Phase 1, 8
  new — 7 RLS integration tests plus 1 always-on gating-visibility test).
  GitHub Actions secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`) set on the repo so CI runs the same
  integration suite for real, not just locally.
