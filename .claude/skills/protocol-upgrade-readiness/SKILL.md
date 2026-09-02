---
name: protocol-upgrade-readiness
description: >
  Pointer to the canonical, ecosystem-wide version of this checklist at
  ~/.claude/skills/protocol-upgrade-readiness/SKILL.md. Use when a new
  Stellar protocol version is announced or already live on testnet, when
  deciding whether to bump `@stellar/stellar-sdk` or `soroban-sdk`, or
  when auditing this project's own code for a CAP-introduced breaking
  change.
allowed-tools: [Read, Edit, Write, Grep, Glob, Bash]
---

# Protocol upgrade readiness check

**This project no longer keeps its own copy of the checklist.** The full
four-step process lives at
`~/.claude/skills/protocol-upgrade-readiness/SKILL.md` — read that file,
not this one, for the actual steps.

Consolidated 02-sep-2026: Periplo wrote this skill the same day as
Nirium (another project on this account) independently wrote its own
version, from the same real Protocol 28 run — both hit the same
`OpenZeppelin/stellar-contracts#865` gap the same week without knowing
the other was looking. Two project-local copies with no way to know
about each other is exactly the failure mode that skill file's own
provenance note describes, so this one now defers to the shared copy
instead of duplicating it. If the canonical file ever needs a
Periplo-specific correction, edit it there — this stub only exists so
`.claude/skills/protocol-upgrade-readiness/` isn't a dead directory.

**Periplo-specific detail worth keeping close at hand** (the canonical
file is intentionally generic): when checking the dependency chain
(step 1), `@x402/stellar` is the tightest-pinned package that matters
most here — check its dependency range before any SDK bump. When
running the real testnet cycle (step 3), the profiles to enumerate are
the `exact` scheme and `upto`'s `contract` profile, both direct-against-
contract and through the facilitator's own HTTP-route code. Evidence
goes to `README.md`'s "What's real right now" section, `CLAUDE.md`'s
Architecture narrative, and `conformance/RESULTS.md` — same as always,
unchanged by this consolidation.
