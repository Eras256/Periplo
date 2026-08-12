# Baseline transcripts: Phase 0

Master spec §5, Phase 0: *"Point a stock client at [the reference facilitator],
capture every request and response verbatim, and commit the transcripts... That
transcript is your specification of 'conformant.'"*

All captures below are real HTTP requests made from this environment (network
access confirmed working; see `docs/DEFERRED.md`), not reconstructed from
documentation. Each transcript file states its capture command, timestamp, and
raw response headers + body verbatim.

## Captured: `x402.org` (the public reference facilitator)

- [`x402-org/supported.md`](x402-org/supported.md): `GET /facilitator/supported`.
  Confirms: Stellar support is advertised as `stellar:testnet` only (no
  `stellar:pubnet` entry), `extra.areFeesSponsored: true`, and two Stellar
  G-account signers. No `stellar:pubnet` kind and no `upto` scheme for
  Stellar, both expected, since this is the reference facilitator we're
  building beyond, not a finished target.
- [`x402-org/discovery-404.md`](x402-org/discovery-404.md): `GET
  /facilitator/discovery/resources` and `GET
  /facilitator/discovery/search?q=weather`, both `404`. **This is the
  measured gap Periplo's Bazaar fills**: the reference facilitator's
  `/supported.extensions` list (`builder-code`, `eip2612GasSponsoring`,
  `erc20ApprovalGasSponsoring`) does not include `bazaar`, and it has no
  discovery endpoints at all. Recorded here rather than assumed, per spec
  §5's "advertised support and reachable support are not the same thing."
- [`x402-org/verify-settle-malformed.md`](x402-org/verify-settle-malformed.md)
  (Phase 3): `POST /facilitator/verify` and `POST /facilitator/settle`
  with a deliberately malformed-but-well-shaped body: confirms both return
  `200` (not `400`) with validity carried in the JSON body, and that
  `invalidReason`/`errorReason` are populated on failure.

## Not yet captured

Spec §5 Phase 0 also asks to check "other multi-chain facilitators claiming
Stellar support." Only `x402.org` was captured in this pass, sequenced next,
not silently dropped (see `docs/DEFERRED.md`). Candidates to check: any
facilitator whose `/supported` response includes a `stellar:*` kind, found via
the x402 Foundation's facilitator registry/ecosystem listing once located.

## Reproducing

```
curl -sS -D - -o - https://x402.org/facilitator/supported
curl -sS -D - -o - https://x402.org/facilitator/discovery/resources
curl -sS -D - -o - "https://x402.org/facilitator/discovery/search?q=weather"
```
