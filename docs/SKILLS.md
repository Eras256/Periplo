# Skills — what's actually available, mapped to phases

`docs/SPEC.md` §0.1 lists a skill-to-phase table assuming a specific
`stellar-build` install. This file records what's **actually** confirmed
present in this environment, corrections to first impressions, and how it
maps to `docs/SPEC.md`'s phases. Update this when a phase discovers a skill
doesn't behave as expected, or a new one becomes relevant.

## Correction on record

`ls ~/.claude/skills/` only lists 13 symlinked skills and does **not**
reflect what's really installed. The fuller `stellar-build` pack (including
every skill `docs/SPEC.md` §0.1 names) is real and reachable — confirmed by
invoking `standards` directly via the `Skill` tool, which returned its full
content. **Don't use directory listings to decide whether a skill exists —
invoke it by name via `Skill` and check the result.**

## Confirmed available, verified in Phase 0

| Skill | Confirmed how | Notes |
| --- | --- | --- |
| `standards` | Invoked directly (Phase 0) | Returned SEP/CAP map, ecosystem reference, and the Raven MCP connect command (`claude mcp add --transport http stellar-raven "https://raven.stellar.buzz/mcp"`). Used this to connect Raven — see below. |
| `init` | Invoked directly (Phase 0) | Used to scaffold `CLAUDE.md`. |
| `code-review`, `review-edge-case-hunter`, `security-review` | Listed in the session's available-skills reminder | **Still not invoked as of Phase 3.** Every gate through Phase 3 (including 3's facilitator-safety checks) was verified by running the real gate commands, real integration tests against live testnet/Supabase, and a real settled transaction cross-checked against Horizon — not by these review skills. That's a legitimate substitute for "did it work," but not for "did a second pass catch something the first pass missed." Genuinely overdue — run at least `security-review` before Phase 6 (the `upto` contract, real money-adjacent) if not sooner.

## Named in spec §0.1, still not exercised through Phase 3 + deployment

These showed up in the fuller available-skills listing surfaced mid-session
(not just the initial 13), so they're presumed real on the same basis as
`standards`, but **none has actually been invoked** — not in Phase 2
(data layer), Phase 3 (facilitator), or the Fly deployment either, despite
spec §0.1 naming `agentic-payments` for exactly Phase 3's work:

`agentic-payments`, `data`, `dapp`, `assets`, `smart-contracts`,
`tyler-architect`, `deploy-stellar-mainnet`.

**Pattern worth being honest about**: every one of those phases ended up
using *direct* verification instead — reading `@x402/stellar`'s actual
shipped source and type definitions, live `curl`/API calls against
Horizon and Soroban RPC, and the `stellar`/`supabase`/`fly` CLIs directly
— rather than going through a skill first. Not a rejection of the skills
specifically; it's what "trust reality over documentation" (spec §12 rule
3) ended up meaning in practice for this build. Worth trying one of these
skills deliberately in Phase 5 or 6 to see whether it changes anything, so
this isn't just a habit going unexamined.

Phase 4 (automatic cataloging) kept the pattern: none of these skills were
invoked. Instead, the session read `@x402/extensions/bazaar`'s real source
directly off GitHub (found the package existed at all this way — it isn't
in `docs/SPEC.md`'s manifest), and verified every claim against a real
Supabase write, a real Fly deploy, and a real GitHub issue filed, not a
skill's output.

## Explicitly not to be used during the build

Per spec §0.1: `scf-submission-drafter`, `scf-prescreen-checker`,
`scf-budget-builder`, `scf-competitor-analyst`, `scf-round-reviewer`,
`scf-round-watcher`, `scf-interest-form-drafter`, `scf-referral-preparer`,
`scf-reviewer`, `scf-tranche-reporter`, `stellar-competitive-landscape`,
`find-stellar-idea` — all of these belong to the *submission* workflow
(drafting/reviewing the grant application itself), which is separate from
writing the code this repo contains. `docs/ECOSYSTEM.md` was assembled from
data pasted directly into the session rather than by invoking any of these,
for the same reason — it's reference material, not a submission draft.

## Raven MCP

Added via `standards`' documented connect command, but reports `! Needs
authentication` (`claude mcp list`) — this is a hosted MCP requiring an
interactive sign-in this non-interactive session can't complete. Substitute
used so far: direct `WebFetch`/registry/live-endpoint checks (see
`docs/DEFERRED.md` and `conformance/baseline/` for what that produced in
Phase 0). Whoever runs the next interactive session should complete the
sign-in so later phases can call `search`/`execute` directly instead.
