# Maintenance: how conformance stays current as the wire spec evolves

`docs/SPEC.md` §11: how spec changes are monitored, how quickly
conformance updates ship, and what happens at grant end. The RFP screens
for drift, not for inability; a facilitator that quietly falls out of
sync with the discovery conventions it claims to implement is a worse
outcome than one that's honest about a gap. This document describes the
practice this project has actually followed so far, not a policy
invented for the submission.

## How spec changes are monitored

There is no subscription mechanism; monitoring is active reading of the
upstream repositories this project builds on, `x402-foundation/x402`
(`@x402/core`, `@x402/stellar`, `@x402/extensions/bazaar`) foremost,
`stellar/js-stellar-sdk` and `OpenZeppelin/stellar-contracts` where the
Soroban side depends on them. This is not a passive stance: this
project's own history is real evidence of it. `docs/UPTO-CONVERGENCE.md`
records active engagement with the `upto` scheme spec while it was still
open, not after it landed; `docs/DEFERRED.md`, `README.md`, and
`CLAUDE.md` record nine real, independently verified bugs found in
dependencies this project actually runs on top of, filed upstream
(seven still open as of this writing, `stellar/stellar-dev-skill#103`
merged 2026-08-28 and `#3187` closed 2026-08-31 when its fix merged),
not just noticed and left alone.

## How quickly conformance updates ship

Traced from real history, not promised in the abstract:

- The opaque-origin `mcp://` bug
  ([x402-foundation/x402#3121](https://github.com/x402-foundation/x402/issues/3121))
  was found via a live integration test, a workaround shipped in this
  repo's own `apps/facilitator/src/discovery.ts` the same day, and an
  upstream fix opened and iterated on within a week
  ([#3138](https://github.com/x402-foundation/x402/pull/3138)).
- The catalog dedupe-key gap
  (`extra.uptoProfile` collisions, `docs/UPTO-CONVERGENCE.md`) was found
  responding to external review and closed with a commit and a
  regression test the same round.
- `docs/SPEC.md` §11's own dependency-manifest re-verification
  requirement, missed before the actual 2026-08-11 submission, was
  caught by an external audit and run for real 8 days later
  (`docs/DEFERRED.md`), not left open once found.

The pattern: a found gap gets a workaround or a fix in this repository
first (so Periplo's own conformance never depends on an upstream release
timeline), and an upstream report second, when the gap isn't
Periplo-specific. Turnaround on the fix has consistently been same-day
to same-week; turnaround on the upstream side depends on maintainers not
under this project's control, tracked honestly as open (`docs/DEFERRED.md`)
rather than assumed resolved.

## What happens at grant end

Same honest answer as `docs/INFRASTRUCTURE.md` gives for hosting costs:
**not yet decided.** There is no committed maintainer-hours budget, no
named second maintainer, and no plan for what happens to active
monitoring of upstream `x402-foundation/x402` changes if the project
owner's own attention moves elsewhere after the grant period. Two things
partially mitigate this without resolving it:

- **Apache-2.0, forkable.** Anything this project stops maintaining is
  still maintainable by someone else, unlike a closed fork of a spec
  reference implementation would be.
- **The catalog format is a plain Postgres schema**
  (`docs/DECENTRALIZATION.md`), not proprietary, so a stalled Periplo
  doesn't strand anyone's already-cataloged data behind a format only
  Periplo's own code can read.

Neither of those is a maintenance plan. Stated as a real, open gap, not
smoothed over.

## Public communication channels: deliberately not committed to a cadence yet

`docs/SPEC.md` §5 (Phase 10) asks for a Matrix room and a Mastodon or Bluesky
account, linked from the hub, with a committed cadence stated here. None
of the three exist yet (`docs/DEFERRED.md`): creating them is genuine
public account creation, held for the project owner's explicit
go-ahead, the same category of decision as filing an issue against a
repository this project doesn't own, not something to commit to a
cadence for in advance of the accounts actually existing. This section
gets filled in once they do, not before.
