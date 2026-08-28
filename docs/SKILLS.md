# Skills: what's actually available, mapped to phases

`docs/SPEC.md` §0.1 lists a skill-to-phase table assuming a specific
`stellar-build` install. This file records what's **actually** confirmed
present in this environment, corrections to first impressions, and how it
maps to `docs/SPEC.md`'s phases. Update this when a phase discovers a skill
doesn't behave as expected, or a new one becomes relevant.

## Correction on record

`ls ~/.claude/skills/` only lists 13 symlinked skills and does **not**
reflect what's really installed. The fuller `stellar-build` pack (including
every skill `docs/SPEC.md` §0.1 names) is real and reachable, confirmed by
invoking `standards` directly via the `Skill` tool, which returned its full
content. **Don't use directory listings to decide whether a skill exists:
invoke it by name via `Skill` and check the result.**

## Confirmed available, verified in Phase 0

| Skill | Confirmed how | Notes |
| --- | --- | --- |
| `standards` | Invoked directly (Phase 0) | Returned SEP/CAP map, ecosystem reference, and the Raven MCP connect command (`claude mcp add --transport http stellar-raven "https://raven.stellar.buzz/mcp"`). Used this to connect Raven, see below. |
| `init` | Invoked directly (Phase 0) | Used to scaffold `CLAUDE.md`. |
| `code-review`, `review-edge-case-hunter`, `security-review` | `security-review` invoked directly (Phase 6) | **`security-review` finally ran, before Phase 6 was called done, not after.** Walked every vulnerability class in the `smart-contracts` skill's own checklist against `contracts/upto-settlement`'s actual code, plus the Soroban-specific properties the checklist doesn't name by number. Found nothing above a false positive, see `docs/DEFERRED.md`'s "An internal security review ran on this contract" section for the full result, and just as important, for the explicit disclaimer that this is not a substitute for a third-party audit (Audit Bank is still the real pending step before mainnet). `code-review` and `review-edge-case-hunter` remain unused as of Phase 6.

## Named in spec §0.1, still not exercised through Phase 3 + deployment

These showed up in the fuller available-skills listing surfaced mid-session
(not just the initial 13), so they're presumed real on the same basis as
`standards`, but **none has actually been invoked**, not in Phase 2
(data layer), Phase 3 (facilitator), or the Fly deployment either, despite
spec §0.1 naming `agentic-payments` for exactly Phase 3's work:

`agentic-payments`, `data`, `dapp`, `assets`,
`tyler-architect`, `deploy-stellar-mainnet`.

**Pattern worth being honest about, and Phase 6 is where it finally broke.**
Phases 1 through 5 all used *direct* verification instead of the named
skills: reading `@x402/stellar`'s actual shipped source and type
definitions, live `curl`/API calls against Horizon and Soroban RPC, and
the `stellar`/`supabase`/`fly` CLIs directly, rather than going through a
skill first. Not a rejection of the skills specifically; it's what "trust
reality over documentation" (spec §12 rule 3) ended up meaning in practice
for this build. Phase 6 tried one of these deliberately, per this file's
own earlier suggestion, and it earned its place, see the `smart-contracts`
section below. The remaining six (`agentic-payments`, `data`, `dapp`,
`assets`, `tyler-architect`, `deploy-stellar-mainnet`) are still untried.

Phase 4 (automatic cataloging) kept the pattern: none of these skills were
invoked. Instead, the session read `@x402/extensions/bazaar`'s real source
directly off GitHub (found the package existed at all this way, it isn't
in `docs/SPEC.md`'s manifest), and verified every claim against a real
Supabase write, a real Fly deploy, and a real GitHub issue filed, not a
skill's output.

## `smart-contracts`: invoked for real in Phase 6

The one skill from the list above that actually got tried, deliberately,
per this file's own earlier note. Invoked via the `Skill` tool at the start
of Phase 6 with a specific ask (project setup, `require_auth_for_args`
scoped to a sub-tuple, `temporary()` storage/TTL for a single-use nonce,
the pull-and-refund cross-contract transfer pattern, and fuzz/property
testing of the auth paths), and it delivered real, load-bearing guidance:
the storage-type decision tree that led to `temporary()` for the nonce key,
the exact `require_auth_for_args` scoping used in `settle()`, and the
`security.md` checklist that the later `security-review` skill invocation
(see above) was run against. One place it was wrong: it assumes
`clang`/LLVM for `cargo-fuzz`; this environment has neither, and `gcc`
turned out to be sufficient once tried, so the assumption didn't block
anything, it was just inaccurate for this machine. Full contract detail is
in `CLAUDE.md`'s `contracts/upto-settlement` paragraph; the fuzz/proptest
findings are in `docs/DEFERRED.md`'s Phase 6 section.

**Not yet run against Phase 6b's two new contracts
(`contracts/agent-verifier`, `contracts/agent-smart-account`)**, unlike
`upto-settlement`, which explicitly went through `security-review` before
being called done. Consistent with the same discipline, not a new gap:
neither contract is done, the live smart-account settlement transaction
is a genuinely open blocker (`docs/DEFERRED.md`'s Phase 6b section,
[OpenZeppelin/stellar-contracts#839](https://github.com/OpenZeppelin/stellar-contracts/issues/839)),
so a security review would be reviewing code still missing its central
end-to-end proof. Worth running once that blocker closes, whenever that
turns out to be, not before.

## Explicitly not to be used during the build

Per spec §0.1: `scf-submission-drafter`, `scf-prescreen-checker`,
`scf-budget-builder`, `scf-competitor-analyst`, `scf-round-reviewer`,
`scf-round-watcher`, `scf-interest-form-drafter`, `scf-referral-preparer`,
`scf-reviewer`, `scf-tranche-reporter`, `stellar-competitive-landscape`,
`find-stellar-idea`, all of these belong to the *submission* workflow
(drafting/reviewing the grant application itself), which is separate from
writing the code this repo contains. `docs/ECOSYSTEM.md` was assembled from
data pasted directly into the session rather than by invoking any of these,
for the same reason, it's reference material, not a submission draft.

## Raven MCP

Added via `standards`' documented connect command, but reports `! Needs
authentication` (`claude mcp list`), this is a hosted MCP requiring an
interactive sign-in this non-interactive session can't complete. Substitute
used so far: direct `WebFetch`/registry/live-endpoint checks (see
`docs/DEFERRED.md` and `conformance/baseline/` for what that produced in
Phase 0). Whoever runs the next interactive session should complete the
sign-in so later phases can call `search`/`execute` directly instead.

## The skill pack's own repo: a real bug found and fixed, 2026-08-16

This file documents skill *usage*, but the pack itself
(`stellar/stellar-dev-skill`, its upstream repo identity confirmed via
`~/.claude/plugins/known_marketplaces.json` rather than assumed from the
local directory name) turned out to have a genuine bug in its own public
skill index. That file is a user-level registry, shared across every
project on this machine rather than scoped to this repo, so it confirms
which repo backs the installed skill pack, not which project's session
found the bug below. 27 of the 28 community-skill entries in
`skills.stellar.org/llms.txt` linked to GitHub's rendered HTML page
instead of the raw markdown an agent needs to fetch, root-caused to the
pack's own `site/README.md` contribution guide having the wrong URL shape
in its own example. Fixed with a PR, not just an issue:
[stellar/stellar-dev-skill#103](https://github.com/stellar/stellar-dev-skill/pull/103),
open as of this writing. Full detail in `docs/MEMORY.md`'s 2026-08-16
entry and `README.md`'s `apps/facilitator` bullet, same evidence
discipline as every other upstream finding this project has filed.
