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

## Responding to external review: three real gaps in our own code, two now closed

[HeylmStoned's comment](https://github.com/x402-foundation/x402/pull/3134)
on `#3134` raised a wire-level concern: with two conformant `upto` profiles,
`scheme: "upto"` alone is ambiguous, and needs a stable discriminator. The
spec already defines one (`extra.uptoProfile`), so we checked our own code
against it rather than just the spec text, and found three real gaps, none
previously recorded, full detail in
[`docs/DEFERRED.md`](DEFERRED.md#upto-profile-discrimination-three-real-implementation-gaps-found-responding-to-external-review-not-self-discovered):
`/supported` couldn't report `upto` in any form, there was no
`GET /discovery/resources` or `GET /discovery/search` route at all, and the
catalog's `accepts` dedupe key wasn't `extra`-aware, so two profiles for
the same resource, network, asset, and `payTo` would silently overwrite
each other rather than coexist. **Closed 2026-08-17, two of three; the
third closed 2026-08-21:** both discovery routes now exist, reusing
`@x402/extensions/bazaar`'s own wire types, and the dedupe key is
`extra.uptoProfile`-aware, each with its own commit and tests.
`/supported` can now report `upto`: `UptoStellarScheme`, a real scheme
implementation registered against `x402Facilitator`, not a stub, with a
real settled transaction through the facilitator's own `verify()`/
`settle()` recorded in `conformance/RESULTS.md`, full writeup in
CLAUDE.md's Architecture section.

## Independent confirmation and a new requirement

Two more implementers engaged the same `#3098` thread afterward rather than
opening a third:

- **AutoLayer** (`autolayer-labs`) confirmed the same
  profile-discrimination requirement, reached independently rather than
  from reading our comment first, and went further: on the same
  [`#3098`](https://github.com/x402-foundation/x402/pull/3098) thread it
  said directly that it "will not open a third competing spec PR,"
  committing instead to implement whichever profile maintainers select
  and to send an implementation PR against the converged spec rather
  than a document of its own. Confirmed against the real comment on the
  PR, not paraphrased from memory.
- **[pedro-pelicioni](https://github.com/pedro-pelicioni)**, building the
  discovery side specifically
  (on [stellar/x402-stellar#72](https://github.com/stellar/x402-stellar/issues/72)),
  raised requirements the settlement side alone never surfaces: how a
  catalog should price a metered listing, how a budget filter should treat
  one, how to rank by settled value instead of raw call count. Checking our
  own catalog against that same point surfaced a fourth real gap, the same
  `extra`-unaware dedupe key above, from a different angle: two `upto`
  profiles for the same resource collided in storage, not just in display.
  Closed alongside the other dedupe-key fix above.

We responded to both with verified, additive findings, not advocacy for our
own design.

## A third independent reviewer, five implementations compared

[davedumto](https://github.com/x402-foundation/x402/pull/3134#issuecomment-5373783683),
2026-08-21, read five real Stellar `upto` implementations in source, not
skimmed, rail402, Rialto, openx402, LumenGate, and Periplo's own
`#3098` reference contract, plus their own deployed instance
(`CDHPA64M73TUTEM4MMHIWIXINBQXH7JJXFGZMGH22VJWFJFROMR6QV2S`, testnet, a
real settlement checked on Horizon). Five findings, ranked by how
settled they seemed: the `require_auth_for_args` exclusion pattern is
converged across all five teams and should be a spec MUST; the
settlement-hook question (rail402's unwrapped hook call vs. openx402's
versioned, authorized entry point) has no spec position yet; a real,
measured benchmark from LumenGate found escrow-and-refund 31.5%
*cheaper* than allowance-based settlement, cutting against the
zero-custody consensus every reviewed design (including both `#3098`
and `#3134`) had assumed without measuring; Rialto's conditional
`autoRevoke` auth-tree shape needs precise spec language so a client
library can build against it without reading each implementation's own
docs; and the nonce-TTL boundary rail402 already tests explicitly
(`NONCE_TTL_LEDGERS`, both sides of the boundary) is worth a required
test vector for any stored-nonce profile.

On point 5, specifically for our own contract,
[our reply](https://github.com/x402-foundation/x402/pull/3134#issuecomment-5383242545)
the next day showed the case doesn't apply the way it's framed for a
boundary-checked design, because ours isn't one:

```rust
let ttl = authorization.deadline_ledger.saturating_sub(ledger);
env.storage().temporary().set(&key, &authorization.deadline_ledger);
env.storage().temporary().extend_ttl(&key, ttl, ttl);
```

The nonce's TTL is derived directly from the signed `deadline_ledger` at
settlement time, so there's no separately-sized ceiling that could fall
short of what an authorization signs for, the two are the same value by
construction. `MAX_WINDOW_LEDGERS` bounds how large that window can ever
be in the first place, verified against the network's own real
storage-TTL ceiling rather than assumed, and the TTL-covers-deadline
property was confirmed live on testnet (a settled nonce's
`liveUntilLedgerSeq`, read back from RPC, exceeding `deadline_ledger` by
exactly the requested margin), not just in a unit test. Not proposed as
*the* required test vector over rail402's own boundary check, since
they're different mechanisms answering the same risk: flagged instead
that "stored TTL-bounded nonce" isn't one shape, and the merged spec
should allow either "derive TTL from the signed deadline" or "check the
deadline against a fixed ceiling" rather than assuming one implies the
other.

## Where it stands

`#3098` is ready for review, waiting on maintainer direction on where the
merged two-profile document should actually consolidate before a
follow-up PR opens. All four implementation gaps above are now closed:
`GET /discovery/*` and the `extra`-aware dedupe key on 2026-08-17, each
with its own commit and tests, and `/supported` reporting `upto` for
real on 2026-08-21 via `UptoStellarScheme`, a real scheme implementation,
not a wiring fix, with a real settled transaction to back it
(`conformance/RESULTS.md`). Real, dated evidence either way, not
resolved-sounding claims without a link behind them.

**2026-08-25: a nudge sent on
[stellar/x402-stellar#72](https://github.com/stellar/x402-stellar/issues/72#issuecomment-5418484702),**
the thread's first activity in 8-9 days, prompted by a separate,
unrelated finding converging in the same direction. Fixing our own
facilitator's catalog to settle-only (see the README's "Automatic
cataloging" bullet and `docs/DEFERRED.md`, prompted by
[x402-foundation/x402#3226](https://github.com/x402-foundation/x402/issues/3226))
turned up that pedro-pelicioni's stellarsight had independently reached
the same settle-only reading. Two Stellar-side catalogs landing on the
same answer without coordinating is the same shape of convergence this
thread already showed for the `upto` design itself, cited in the nudge
as evidence rather than as a technical note in isolation. The actual
open question, whether `#3098` or `#3134` is what the wire spec
consolidates onto, was asked directly. **Answered, 2026-08-26, with a
concrete direction**: see below, bomanaps recommended consolidating on
`#3134` with real evidence behind it, not just a preference.

**2026-08-25/26: responded on `#3098` itself to pedro-pelicioni's
pricing-metadata proposal
([`#3181`](https://github.com/x402-foundation/x402/pull/3181), closing
[`#3264`](https://github.com/x402-foundation/x402/issues/3264)),
[comment](https://github.com/x402-foundation/x402/pull/3098#issuecomment-5418697386).**
Acknowledged it as complementary, not competing: pedro-pelicioni
designed it to live at the discovery layer rather than the core `upto`
scheme, consistent with the position he already took on `#72`. Also
corrected our own earlier speculation from that same `#72` comment,
against the actual published design rather than what we'd guessed it
might look like: `pricing` sits as a sibling of `info`/`schema` on the
bazaar extension itself, resource-level, not per-`accepts`-entry, so it
doesn't end up giving our `extra.uptoProfile` dedupe key anywhere new to
pick up a discriminator from, the two live at different levels of the
structure. Not a flaw in the proposal, just narrower overlap with our
own dedupe problem than the earlier speculation assumed;
`extra.uptoProfile` stays our own, separate answer to that specific
problem. Also connected `#3181`'s point 3 (settlement-count ranking
stops being comparable once amounts vary) to the settle-only fix closed
the same round, the same integrity thread one step further down the
amount-normalization axis. Offered to wire `pricing` into our own
catalog and report back with real numbers once it merges, rather than
just agreeing it's a good idea.

**2026-08-26: bomanaps answered the nudge with a concrete direction,
not just an acknowledgment.**
[Reply on `#72`](https://github.com/stellar/x402-stellar/issues/72#issuecomment-5423343680):
`#3134` is ready to consolidate on, backed by real evidence, not a
preference, commits signed, contract deployed, exercised on testnet
covering both G-account and C-account payers (the PR's own body: 7 of
7 tests passing). Directly answers the nonce-TTL bug class this
thread's own comparison already surfaced: `#3134`'s design gets replay
protection from the protocol nonce itself, so there is no app-managed
TTL to size wrong at all. Also confirmed, independently from Rialto's
own side this time, the same settle-only cataloging reading `#3226`
was auditing, with provenance labels on every catalog entry.

**2026-08-26/27: our own case joined that same thread, and a
maintainer named the result.** Commented directly on `#3226` citing
[`fae6daa9`](https://github.com/Eras256/Periplo/commit/fae6daa90885e99d81056c1178d2e13ab81d3980)
(the settle-only fix earlier in this file), a third implementation
reaching the same reading independently.
[whawk46 replied](https://github.com/x402-foundation/x402/issues/3226#issuecomment-5438145198),
naming it explicitly: "With Periplo, @pedro-pelicioni, and our datasets
aligned, we have the consensus needed to make settle-only catalog
provenance a normative requirement in the specification." `#3226`
itself was retitled from an open question to a formal proposal in
response: "Label catalog provenance, verify-only versus settled, so
Bazaar counters mean something." Not just three implementations
converging on an answer, now cited as the evidence for writing the
norm.

The same day, on `#3134` itself,
[bomanaps proposed a concrete structure](https://github.com/x402-foundation/x402/pull/3134#issuecomment-5423560051)
for the merged document: `stateless` as the base profile (no
implementation-defined boundary to test), `contract`/stateful carrying
the required test vectors, both mechanisms accepted rather than one
picked as canonical, replying directly to the TTL exchange above.
[We agreed](https://github.com/x402-foundation/x402/pull/3134#issuecomment-5432236025)
and folded in HeylmStoned's earlier wire-level point before the
structure gets drafted: `scheme: "upto"` alone still doesn't
disambiguate the two profiles once both exist in one spec, the merged
document needs the stable `extra.uptoProfile` discriminator (already
tracked in `docs/DEFERRED.md`) reflected in `/supported` too, or the
clean base-vs-stateful split leaves the exact client-side ambiguity
this thread already found unresolved.
