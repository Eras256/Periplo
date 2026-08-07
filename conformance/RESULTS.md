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

**`stellar:pubnet`**: not yet attempted — no mainnet fee-sponsor key exists
(none should, until real deployment; see `docs/DEFERRED.md`). Both networks
are still a committed deliverable (spec §2); this row will be added once
Phase 10's mainnet deployment is real.

**`upto` scheme**: not applicable yet — Phase 6, contract not built.

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
