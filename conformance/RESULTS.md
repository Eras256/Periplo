# Conformance results — evidence table

Per `docs/SPEC.md` §11: the evidence table for capability claims. Every row
here is a real, independently-verifiable artifact — a transaction hash
checked against Horizon, not an assertion. `conformance/baseline/` holds
the reference-facilitator transcripts this project's behavior is measured
against.

## Settled transactions

| Date | Network | Scheme | Transaction hash | Verified | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-08-07 | `stellar:testnet` | `exact` | [`83d2aa3b60b7f8332e68082e2ed1f3e1ff7f4e01f4b4d987d9fca5c6c9d89f33`](https://stellar.expert/explorer/testnet/tx/83d2aa3b60b7f8332e68082e2ed1f3e1ff7f4e01f4b4d987d9fca5c6c9d89f33) | [Horizon](https://horizon-testnet.stellar.org/transactions/83d2aa3b60b7f8332e68082e2ed1f3e1ff7f4e01f4b4d987d9fca5c6c9d89f33) — `successful: true`, ledger `4023444` | Phase 3 gate. Full pipeline: `@x402/stellar`'s client-side `ExactStellarScheme` built and signed the payment; this repo's own facilitator core (`apps/facilitator`) called `verify()` then `settle()` on it — see `apps/facilitator/scripts/settle-demo.ts`. |
| 2026-08-12 | `stellar:testnet` | `upto` | [`cc46374e34f70ff479ccf919d55df33d0bf1a05e1c7479fa8f90dac596c5d218`](https://stellar.expert/explorer/testnet/tx/cc46374e34f70ff479ccf919d55df33d0bf1a05e1c7479fa8f90dac596c5d218) | [Horizon](https://horizon-testnet.stellar.org/transactions/cc46374e34f70ff479ccf919d55df33d0bf1a05e1c7479fa8f90dac596c5d218) — `successful: true`, ledger `4106753` | Phase 6 gate. `UptoSettlement` (`contracts/upto-settlement`) deployed to `CAK3R734WLT4JU2XMQOJ6NIB3BWGPI442CH44EFJG5AORMXFE7G4MQFW`, WASM hash `3f4df3070459047e52a5514a4bd42f31888d100cce61914d8675534eb20dfe07`. A genuine **partial** settlement: buyer signed a `0.1 PTEST` ceiling, facilitator settled `0.04 PTEST` — see `apps/facilitator/scripts/upto-settle-demo.ts`. |

**`stellar:pubnet`**: not yet attempted — no mainnet fee-sponsor key exists
(none should, until real deployment; see `docs/DEFERRED.md`). Both networks
are still a committed deliverable (spec §2); this row will be added once
Phase 10's mainnet deployment is real.

## What the settled transaction actually proves

Independently checked against Horizon (not just trusted from the script's
own printed output):

- `transactions/{hash}` → `successful: true`, `ledger: 4023444`,
  `source_account` = the facilitator's own fee-sponsor address
  (`GDXULEKCDTYLN2RD7ID7ZTVUJVIDYPJTL7OY7DFN7Z5S4XKFFN6FOFLE`), `fee_charged:
  23067` stroops — **the facilitator paid the fee, not the buyer or
  seller**, confirming fee sponsorship actually happened on-chain, not just
  in the JSON response.
- The seller/`payTo` account's balance shows exactly `0.1000000 PTEST`
  after the transaction — the amount specified in `paymentRequirements`
  (`1000000` in atomic units, 7 decimals) actually moved, to the actual
  recipient.
- The asset is a self-issued test SEP-41 token
  (`CCK2UCUDA2CYGBHIPURM6TIXZEHULBVIGPVB2UTP3R2LCIKB3O5P723X`, a Stellar
  Asset Contract wrapping the classic asset `PTEST` issued by this
  project's own testnet issuer account), not Circle's testnet USDC —
  Circle's faucet requires a browser/CAPTCHA with no API
  (`docs/DEFERRED.md`), so a self-issued token is what made an
  automatable, real settlement possible in this build session. The
  facilitator and `@x402/stellar` treat the asset address as a parameter;
  nothing about the result is specific to this asset over genuine USDC.

## What the settled `upto` transaction actually proves

Also independently checked against Horizon, not just the script's own
printed output — `transactions/{hash}` → `successful: true`,
`source_account` = the fee-sponsor address (facilitator, not buyer or
seller), `fee_charged: 42872` stroops. The `/effects` endpoint shows the
full pull-and-refund sequence in order: buyer debited `0.1 PTEST` (the
signed ceiling), the contract credited then debited `0.04 PTEST` to the
seller (the actual charge) and `0.06 PTEST` back to the buyer (the
refund) — the exact partial-settlement arithmetic `scheme_upto_stellar.md`
describes, not just a full payout. A separate post-hoc query
(`stellar contract invoke ... -- balance --id <contract>`) confirms the
contract's own SEP-41 balance is `0` — the "never holds a balance across
transactions" invariant the spec's security section names.

This run also closes the three assumptions `docs/SPEC.md` §6 and the spec
PR mark open, each against real testnet behavior, not simulation-only:

1. **`require_auth_for_args` root tuple + sub-invocation.** The buyer's
   real signed auth entry (inspected via `inspectAuthEntry`, not asserted)
   has root call `argCount=1` — the authorized tuple is `(authorization,)`
   only, `actual_amount` never appears in it — with exactly one
   sub-invocation, `transfer(from, contract, max_amount)` on the PTEST
   asset. Matches the spec's design exactly.
2. **Resource limits.** Real simulation: `2,026,530` instructions (0.5%
   of testnet's `400,000,000` ceiling), `392` read bytes, `680` write
   bytes (both far under the `200,000`/`132,096`-byte ceilings),
   `162,433` stroops minimum resource fee. Pull → pay → refund fits with
   wide headroom.
3. **`temporary()` TTL covers the deadline window.** Read back from RPC
   after settlement: the nonce entry's `liveUntilLedgerSeq` (`4107472`)
   exceeds `deadline_ledger` (`4106782`) by exactly the `MAX_WINDOW_LEDGERS`
   margin the contract requested via `extend_ttl`.

Reproducible with `node --env-file=.env apps/facilitator/scripts/upto-settle-demo.ts`
(spends a small amount of the test buyer's PTEST balance each run — not
wired into `pnpm test` for that reason, same as `settle-demo.ts`).

## `/supported`, `/verify`, `/settle` wire conformance

Checked directly against `apps/facilitator`'s own test suite (`pnpm test`,
`apps/facilitator/src/*.test.ts`), not just asserted:

- `/supported` shape matches `conformance/baseline/x402-org/supported.md`
  exactly (`kinds`/`extensions`/`signers`, `extra.areFeesSponsored: true`).
- `/verify` and `/settle` match
  `conformance/baseline/x402-org/verify-settle-malformed.md`'s observed
  behavior: `200` (not `400`) for a malformed-but-well-shaped inner
  payload, with the failure reason carried in the JSON body
  (`invalidReason` / `errorReason`), never null.
- The x402 e2e suite itself (Phase 8) has not been run — that's a
  dedicated later phase, not implied by this table.
