# For reviewers: a 10-minute path through this repo

`CLAUDE.md` is written for a Claude Code session to resume work; it
assumes you already know the project. This file assumes the opposite:
you're a panel reviewer with 20+ submissions to get through and ten
minutes for this one. Read in this order.

## 1. Click something real first (30 seconds)

[`https://periplo-testnet.fly.dev`](https://periplo-testnet.fly.dev) is
live right now, `stellar:testnet`. `GET /supported` returns the real
`exact` scheme capabilities; `GET /discovery/resources` returns the real
Bazaar catalog. Nothing below this line needs to be taken on faith,
you can check it yourself before reading another word.

## 2. The one thing no other submission in this round can currently show (2 minutes)

Two direct competitors in this same SCF #45 round chose to build on the
`upto` payment spec this project opened upstream, rather than fork their
own: [Rialto merged into the same spec file](https://github.com/x402-foundation/x402/pull/3134),
and [AutoLayer stated on the thread](https://github.com/x402-foundation/x402/pull/3098)
that it "will not open a third competing spec PR." Read
[the "ecosystem is converging" section of README.md](../README.md#the-ecosystem-is-converging-on-this-spec-not-the-other-way-around)
or the full [`docs/UPTO-CONVERGENCE.md`](UPTO-CONVERGENCE.md) devlog for
the sourced, dated version.

## 3. The evidence table (2 minutes)

[`conformance/RESULTS.md`](../conformance/RESULTS.md) lists every settled
transaction this project claims, each with a transaction hash checked
against Horizon independently, not just printed by the script that made
it. This is the standard applied to every capability claim in this repo:
a link, a test, or a hash, never a bare assertion. `README.md`'s "What's
real right now" section follows the same rule and is explicit about what
is planned but not yet built.

## 4. What's actually deployed vs. what's still a plan (2 minutes)

`README.md`'s opening section states the phase status plainly (Phase 6,
the `upto` Soroban contract, complete; Phase 7 onward not started) and
says outright that there is no frontend yet. If you want the honest,
itemized list of every deferred piece and every environment-specific
gotcha encountered along the way, that's
[`docs/DEFERRED.md`](DEFERRED.md), the project's own running log of
blockers and divergences, not a curated highlight reel.

## 5. Security, if that's your focus (2 minutes)

[`docs/THREAT-MODEL.md`](THREAT-MODEL.md) is the threat/control/test
table, each row pointing at the actual code and test file that backs it,
including the one honest gap (no CI-enforced secret-leakage check yet)
stated rather than hidden. Third-party review has not happened yet: see
that file's own status note, and [`docs/DEFERRED.md`](DEFERRED.md)'s
"Third-party security review: pending via Audit Bank" section for
exactly where that stands.

## 6. If you want the full architecture

[`docs/ARCHITECTURE.md`](ARCHITECTURE.md) has the system diagram and a
plain-English walk-through of the stack. [`docs/SPEC.md`](SPEC.md) is the
full, phased build specification everything above is built against, for
when ten minutes becomes an hour.
