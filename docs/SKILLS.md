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
| `code-review`, `review-edge-case-hunter`, `security-review` | Listed in the session's available-skills reminder | Not yet invoked — spec §0.1 says run both before declaring any gate passed; Phase 0's gate was verified by directly running the gate commands and reading their output instead. Revisit before declaring later phases' gates passed, especially 1 (trust boundary), 3 (facilitator safety), 6 (contract).

## Named in spec §0.1, not yet exercised

These showed up in the fuller available-skills listing surfaced mid-session
(not just the initial 13), so they're presumed real on the same basis as
`standards`, but none has actually been invoked yet — don't assume their
output shape until one has:

`agentic-payments`, `data` *(not seen in the listing yet — check when Phase
2 starts; may not exist under that exact name)*, `dapp`, `assets`,
`smart-contracts`, `tyler-architect`, `deploy-stellar-mainnet`.

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
