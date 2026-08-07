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
