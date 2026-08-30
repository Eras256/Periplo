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

## 3. A real, external seller already uses this (1 minute)

Section 2 is design-level alignment between competing teams. This is
adoption: [`agentpayments.fi`](https://agentpayments.fi) built its own
resource server, pointed it at this facilitator with no coordination
beyond following [`docs/SELLERS.md`](SELLERS.md), and settled a real
payment, real testnet USDC, from a buyer that isn't this project either.
Try it yourself:
[`GET /discovery/search?query=conformance`](https://periplo-testnet.fly.dev/discovery/search?query=conformance)
returns their resource as the top result, found by a stranger, not
inserted by us. The settled transaction
([`4befe51d2c1e...`](https://stellar.expert/explorer/testnet/tx/4befe51d2c1e58387d128c2f759262d33454b209f2aee8a03283a85b027904fd))
is the row `conformance/RESULTS.md` itself marks as the strongest
evidence in that document, ahead of every transaction this project
settled with its own test accounts.

That same integration found a real bug in the official client itself:
`HTTPFacilitatorClient` discarded the `EXTENSION-RESPONSES` header
instead of returning it, filed as
[x402-foundation/x402#3270](https://github.com/x402-foundation/x402/issues/3270)
and now generating fixes across three separate SDKs
([`#3278`](https://github.com/x402-foundation/x402/pull/3278) TypeScript,
[`#3301`](https://github.com/x402-foundation/x402/pull/3301) Go,
[`PhilBot402/x402#4`](https://github.com/PhilBot402/x402/pull/4) Python,
draft, all open as of this writing). Full detail in `README.md`, the
block starting "The first real external seller published and settled
for real."

## 4. The evidence table (2 minutes)

[`conformance/RESULTS.md`](../conformance/RESULTS.md) lists every settled
transaction this project claims, each with a transaction hash checked
against Horizon independently, not just printed by the script that made
it. This is the standard applied to every capability claim in this repo:
a link, a test, or a hash, never a bare assertion. `README.md`'s "What's
real right now" section follows the same rule and is explicit about what
is planned but not yet built.

## 5. What's actually deployed vs. what's still a plan (2 minutes)

`README.md`'s opening section states the phase status plainly: "Status:
Phase 6, the `upto` Soroban contract, is complete... The rest of Phase
10 is not done." That's a broader claim than "nothing since Phase 6":
Phase 6b (additional evidence beyond the Phase 6 gate, not a tranche
deliverable), the `upto` HTTP-route wiring, the official x402
conformance-suite run, and the live demo resource all happened after
Phase 6 and are documented in this same README, in `CLAUDE.md`, and in
[`conformance/RESULTS.md`](../conformance/RESULTS.md). What genuinely
hasn't started is Phase 7 (the MCP discovery server, named as next in
`CLAUDE.md`'s own status line) and Phase 9, the developer hub; the
README says so outright for the frontend. If you want the honest,
itemized list of every deferred piece and every environment-specific
gotcha encountered along the way, that's
[`docs/DEFERRED.md`](DEFERRED.md), the project's own running log of
blockers and divergences, not a curated highlight reel.

## 6. Security, if that's your focus (2 minutes)

[`docs/THREAT-MODEL.md`](THREAT-MODEL.md) is the threat/control/test
table, each row pointing at the actual code and test file that backs it,
including the one honest gap (no CI-enforced secret-leakage check yet)
stated rather than hidden. Third-party review has not happened yet: see
that file's own status note, and [`docs/DEFERRED.md`](DEFERRED.md)'s
"Third-party security review: pending via Audit Bank" section for
exactly where that stands.

## 7. If you want the full architecture

[`docs/ARCHITECTURE.md`](ARCHITECTURE.md) has the system diagram and a
plain-English walk-through of the stack. [`docs/SPEC.md`](SPEC.md) is the
full, phased build specification everything above is built against, for
when ten minutes becomes an hour.
