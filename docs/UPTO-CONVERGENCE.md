# `upto` spec convergence: a devlog

The `upto` scheme's story is spread across three upstream threads
([x402-foundation/x402#3098](https://github.com/x402-foundation/x402/pull/3098),
[#3134](https://github.com/x402-foundation/x402/pull/3134), and
[stellar/x402-stellar#72](https://github.com/stellar/x402-stellar/issues/72))
plus [`docs/DEFERRED.md`](DEFERRED.md). This file is the short, chronological
version: what happened, in order, with links to the real evidence rather than
a restatement of it. README.md and CLAUDE.md link here instead of repeating
the narrative inline.

## Why `upto` exists

A plain SEP-41 allowance cannot express a metered, single-use payment: it
fails recipient binding (`transfer_from` lets the spender choose any
destination, not just the resource server) and single-use (an allowance is a
standing balance, not a one-shot ceiling). `upto` needed a network spec of
its own, opened at
[x402-foundation/x402#3098](https://github.com/x402-foundation/x402/pull/3098)
([issue #3097](https://github.com/x402-foundation/x402/issues/3097)).

## Periplo's submission: the `contract` profile

`#3098` proposed the `contract` profile: `contracts/upto-settlement`, a
Soroban contract using `require_auth_for_args` restricted to a sub-tuple so
the settled amount stays outside what the buyer signs, an atomic
pull-pay-refund with no custody window, and a nonce in `temporary()` storage
for single use. Built, tested (35 unit and property tests, a `cargo-fuzz`
target with 47,630 clean executions), and deployed to `stellar:testnet`
(`CAK3R734WLT4JU2XMQOJ6NIB3BWGPI442CH44EFJG5AORMXFE7G4MQFW`), with a real
partial settlement recorded in
[`conformance/RESULTS.md`](../conformance/RESULTS.md), independently checked
against Horizon.

## A second design appears: `#3134`

[Iam0TI](https://github.com/Iam0TI), via
[0d1026/Rialto](https://github.com/0d1026/Rialto), opened
[#3134](https://github.com/x402-foundation/x402/pull/3134) against the same
spec file: a `stateless` profile using SEP-41 `approve`/`transfer_from`
instead of pull-and-refund, relying on Soroban's own per-entry auth nonce
instead of an app-managed one, with no binding to a single named facilitator.
Rialto's own PR description flagged the overlap as something worth
converging on rather than leaving for maintainers to arbitrate between two
competing documents.

## The honest comparison

Before drafting anything public, we ran a technical comparison of the two
designs, not advocacy for our own. Full writeup in
[`docs/DEFERRED.md`](DEFERRED.md#upto-spec-convergence-with-a-competing-pr-3098-now-documents-two-profiles).
Real strengths on both sides, stated plainly:

- **`stateless` genuinely settles cheaper.** Pulled real `fee_charged`
  numbers from both projects' own settled testnet transactions: roughly
  25 to 30 percent lower than `contract`. It also removes an entire
  implementation-bug class, since there is no author-sized TTL to get
  wrong and replay protection is the protocol's own guarantee, not an
  app-managed nonce.
- **`contract` closes a gap `stateless` leaves open.** A leaked or
  multiply-forwarded `stateless` authorization can be settled by anyone
  holding it, up to the full signed ceiling, not just the facilitator the
  resource server intended.
- **A finding raised generously, not as a defect:** `stateless`'s
  `autoRevoke = false` option lets a later, unrelated authorization
  silently overwrite a deliberately preserved leftover allowance, since
  SEP-41 `approve` replaces rather than adds.

Both of `#3134`'s cited testnet transactions were independently verified
before being cited as fact in a spec change: decoded the `settle` call's raw
XDR directly, confirming one genuine partial settlement (`300,000` of a
`1,000,000` ceiling) and one genuine maximum settlement (`500,000` of
`500,000`).

**Outcome:** `#3098` now documents both profiles by name, `contract`
(default) and `stateless` (credited to Iam0TI, `0d1026/Rialto`, `#3134`),
plus C-account/smart-wallet spec language that was missing from the
original prose. `#3098` was marked ready for review once this landed.

## Responding to external review: three real gaps in our own code

[HeylmStoned's comment](https://github.com/x402-foundation/x402/pull/3134)
on `#3134` raised a wire-level concern: with two conformant `upto` profiles,
`scheme: "upto"` alone is ambiguous, and needs a stable discriminator. The
spec already defines one (`extra.uptoProfile`), so we checked our own code
against it rather than just the spec text, and found three real gaps, none
previously recorded, full detail in
[`docs/DEFERRED.md`](DEFERRED.md#upto-profile-discrimination-three-real-implementation-gaps-found-responding-to-external-review-not-self-discovered):
`/supported` can't report `upto` in any form yet, there's no
`GET /discovery/resources` or `GET /discovery/search` route at all, and the
catalog's `accepts` dedupe key isn't `extra`-aware, so two profiles for the
same resource, network, asset, and `payTo` would silently overwrite each
other rather than coexist. Not fixed yet.

## Independent confirmation and a new requirement

Two more implementers engaged the same `#3098` thread afterward rather than
opening a third:

- **AutoLayer** confirmed the same profile-discrimination requirement,
  reached independently rather than from reading our comment first.
- **[pedro-pelicioni](https://github.com/pedro-pelicioni)**, building the
  discovery side specifically
  (on [stellar/x402-stellar#72](https://github.com/stellar/x402-stellar/issues/72)),
  raised requirements the settlement side alone never surfaces: how a
  catalog should price a metered listing, how a budget filter should treat
  one, how to rank by settled value instead of raw call count. Checking our
  own catalog against that same point surfaced a fourth real gap, the same
  `extra`-unaware dedupe key above, from a different angle: two `upto`
  profiles for the same resource collide in storage today, not just in
  display.

We responded to both with verified, additive findings, not advocacy for our
own design.

## Where it stands

No pending reply on either thread as of this writing. `#3098` is ready for
review, waiting on maintainer direction on where the merged two-profile
document should actually consolidate before a follow-up PR opens. The four
implementation gaps above (`/supported`, `GET /discovery/*`, and the
`extra`-aware dedupe key, found from two independent angles) are recorded
but not fixed. Both are tracked as real, open, dated evidence, not resolved
claims.
