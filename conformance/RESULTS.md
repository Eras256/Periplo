# Conformance results: evidence table

Per `docs/SPEC.md` §11: the evidence table for capability claims. Every row
here is a real, independently-verifiable artifact: a transaction hash
checked against Horizon, not an assertion. `conformance/baseline/` holds
the reference-facilitator transcripts this project's behavior is measured
against.

## Settled transactions

| Date | Network | Scheme | Transaction hash | Verified | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-08-07 | `stellar:testnet` | `exact` | [`83d2aa3b60b7f8332e68082e2ed1f3e1ff7f4e01f4b4d987d9fca5c6c9d89f33`](https://stellar.expert/explorer/testnet/tx/83d2aa3b60b7f8332e68082e2ed1f3e1ff7f4e01f4b4d987d9fca5c6c9d89f33) | [Horizon](https://horizon-testnet.stellar.org/transactions/83d2aa3b60b7f8332e68082e2ed1f3e1ff7f4e01f4b4d987d9fca5c6c9d89f33): `successful: true`, ledger `4023444` | Phase 3 gate. Full pipeline: `@x402/stellar`'s client-side `ExactStellarScheme` built and signed the payment; this repo's own facilitator core (`apps/facilitator`) called `verify()` then `settle()` on it, see `apps/facilitator/scripts/settle-demo.ts`. |
| 2026-08-12 | `stellar:testnet` | `upto` | [`cc46374e34f70ff479ccf919d55df33d0bf1a05e1c7479fa8f90dac596c5d218`](https://stellar.expert/explorer/testnet/tx/cc46374e34f70ff479ccf919d55df33d0bf1a05e1c7479fa8f90dac596c5d218) | [Horizon](https://horizon-testnet.stellar.org/transactions/cc46374e34f70ff479ccf919d55df33d0bf1a05e1c7479fa8f90dac596c5d218): `successful: true`, ledger `4106753` | Phase 6 gate. `UptoSettlement` (`contracts/upto-settlement`) deployed to `CAK3R734WLT4JU2XMQOJ6NIB3BWGPI442CH44EFJG5AORMXFE7G4MQFW`, WASM hash `3f4df3070459047e52a5514a4bd42f31888d100cce61914d8675534eb20dfe07`. A genuine **partial** settlement: buyer signed a `0.1 PTEST` ceiling, facilitator settled `0.04 PTEST`, see `apps/facilitator/scripts/upto-settle-demo.ts`. |
| 2026-08-13 | `stellar:testnet` | `upto` | [`2138c0418a85e1bb29c2eab6cea6c76b3b0231d894450a35905053f36403d358`](https://stellar.expert/explorer/testnet/tx/2138c0418a85e1bb29c2eab6cea6c76b3b0231d894450a35905053f36403d358) | [Horizon](https://horizon-testnet.stellar.org/transactions/2138c0418a85e1bb29c2eab6cea6c76b3b0231d894450a35905053f36403d358): `successful: true`, ledger `4129203`, `fee_charged: 54875` stroops, source account the fee-sponsor | Phase 6b, zero-settlement. Same deployed contract as the row above. A genuine `actual_amount = 0` settlement: buyer signed a `0.05 PTEST` ceiling, facilitator settled `0`, confirmed via `/effects` that the full ceiling round-tripped back to the buyer and the seller's balance never moved, see `apps/facilitator/scripts/upto-settle-zero-demo.ts`. A same-nonce replay attempt immediately after was rejected on testnet with `Error(Contract, #6)` (`AuthorizationConsumed`), confirming the nonce is consumed even when nothing was charged. |
| 2026-08-17 | `stellar:testnet` | `exact` | [`41277c14505a17f843a1f366b35314c6b12e6a14de40c30b589f161f7948f578`](https://stellar.expert/explorer/testnet/tx/41277c14505a17f843a1f366b35314c6b12e6a14de40c30b589f161f7948f578) | [Horizon](https://horizon-testnet.stellar.org/transactions/41277c14505a17f843a1f366b35314c6b12e6a14de40c30b589f161f7948f578): `successful: true`, ledger `4195035`, `fee_charged: 22973` stroops, source account the fee-sponsor | The official `x402-foundation/x402` e2e conformance suite (not a Periplo-authored equivalent), run end to end against the live `https://periplo-testnet.fly.dev` deployment via the suite's own `external-proxies` mechanism, real testnet USDC. Verdict `✅ Test passed`. Full transcript, setup, and a real gap found in the suite's own client bootstrapping in [`docs/conformance/2026-08-17-x402-e2e-stellar-exact.md`](../docs/conformance/2026-08-17-x402-e2e-stellar-exact.md). |
| 2026-08-17 | `stellar:testnet` | `exact` | [`232a3f7cf09f5e9ca6afef313a4cbd91db2be8673383f56797088f7963ceef45`](https://stellar.expert/explorer/testnet/tx/232a3f7cf09f5e9ca6afef313a4cbd91db2be8673383f56797088f7963ceef45) | [Horizon](https://horizon-testnet.stellar.org/transactions/232a3f7cf09f5e9ca6afef313a4cbd91db2be8673383f56797088f7963ceef45): `successful: true`, ledger `4195416`, `fee_charged: 22973` stroops, source account the fee-sponsor | Same-day follow-up to the row above, with `--extensions=bazaar` and the proxy forwarding `/discovery/resources`/`/discovery/search` too. The suite's own Discovery Validation step (calling those two routes directly against the facilitator, not the resource server) verdict: `✅ Discovery Validation: PASSED`, the just-paid-for resource discovered by both routes. Two transient client-side flakes hit along the way, neither reproducible on retry, recorded rather than hidden, see the conformance doc. |
| 2026-08-19 | `stellar:testnet` | `exact` | [`dde62ac5e67730a0751052a2dafc67dffc595df20bacbae9aaa1c758081deaea`](https://stellar.expert/explorer/testnet/tx/dde62ac5e67730a0751052a2dafc67dffc595df20bacbae9aaa1c758081deaea) | [Horizon](https://horizon-testnet.stellar.org/transactions/dde62ac5e67730a0751052a2dafc67dffc595df20bacbae9aaa1c758081deaea): `successful: true`, ledger `4228024`, `fee_charged: 56757` stroops, source account the fee-sponsor | `apps/facilitator/src/demo-resource.ts`'s real payment-gated resource (`GET /demo/temperature-convert`, self-facilitation), run against the live `https://periplo-testnet.fly.dev` deployment via `apps/facilitator/scripts/demo-resource-settle.ts`. Cataloged as a side effect of this exact settlement (`onAfterSettle` hook calling the same `processBazaarExtension` `/settle` uses), confirmed via `GET /discovery/resources` returning `url: "https://periplo-testnet.fly.dev/demo/temperature-convert"`, the first externally-reachable resource in the catalog. Real testnet Soroban fees (~72,000 stroops for a plain SAC transfer that day, `fee_stats.fee_charged.p95` on Horizon) exceeded the library's default 50,000-stroop ceiling on the first two attempts (`invalid_exact_stellar_payload_fee_exceeds_maximum`, not specific to this route); fixed by raising `MAX_TRANSACTION_FEE_STROOPS` to 200,000 on the deployed facilitator, see CLAUDE.md's Architecture section. |
| 2026-08-21 | `stellar:testnet` | `upto` | [`35085ff714c54e591634cfe61c5f7d8b94e702aa6273005c29c9a0e369301829`](https://stellar.expert/explorer/testnet/tx/35085ff714c54e591634cfe61c5f7d8b94e702aa6273005c29c9a0e369301829) | [Horizon](https://horizon-testnet.stellar.org/transactions/35085ff714c54e591634cfe61c5f7d8b94e702aa6273005c29c9a0e369301829): `successful: true`, ledger `4263846`, `fee_charged: 42894` stroops, source account the fee-sponsor | First settlement through this facilitator's **own HTTP-route code path**, not the raw contract client: `apps/facilitator/src/upto-stellar-scheme.ts`'s new `UptoStellarScheme`, registered in `core.ts` alongside `ExactStellarScheme`, called via the same `core.verify()`/`core.settle()` every other row in this table already goes through. Closes the gap this file's own Phase 6 entries and CLAUDE.md both tracked open ("the facilitator does not call `UptoSettlement` yet from its own HTTP routes"). A genuine **partial** settlement: buyer signed a `0.1 PTEST` ceiling, facilitator settled `0.035 PTEST`, confirmed via `/effects` (buyer debited `0.1`, seller credited `0.035`, buyer refunded `0.065`, matching the pull-pay-refund sequence exactly), see `apps/facilitator/scripts/upto-http-route-settle-demo.ts`. Not yet configured on the live `https://periplo-testnet.fly.dev` deployment (`UPTO_SETTLEMENT_CONTRACT_TESTNET` unset there as of this writing; the facilitator boots and serves `exact` fine without it, `upto` just isn't advertised on `/supported` until it's set), tracked in `docs/DEFERRED.md`. |
| 2026-08-26 | `stellar:testnet` | `exact` | [`12470945ac72aed3b781f102848f2346c85e3c85d874fb2a3ff6cf17df6cd375`](https://stellar.expert/explorer/testnet/tx/12470945ac72aed3b781f102848f2346c85e3c85d874fb2a3ff6cf17df6cd375) | [Horizon](https://horizon-testnet.stellar.org/transactions/12470945ac72aed3b781f102848f2346c85e3c85d874fb2a3ff6cf17df6cd375): `successful: true`, ledger `4336842`, `fee_charged: 54277` stroops, source account the fee-sponsor | Verifies the `extension_payloads` fix (migration `20260826010000_extension_payloads.sql`): re-catalogs `GET /demo/temperature-convert` through the deployed, fixed code path (`apps/facilitator/scripts/demo-resource-settle.ts`), confirmed live afterward via `GET /discovery/search` returning the full declared `info`/`schema` object under `extensions.bazaar`, not the empty `{}` every resource returned before this fix. See CLAUDE.md's Architecture section and `docs/DEFERRED.md`. |
| 2026-08-26 | `stellar:testnet` | `exact` | [`4befe51d2c1e58387d128c2f759262d33454b209f2aee8a03283a85b027904fd`](https://stellar.expert/explorer/testnet/tx/4befe51d2c1e58387d128c2f759262d33454b209f2aee8a03283a85b027904fd) | [Horizon](https://horizon-testnet.stellar.org/transactions/4befe51d2c1e58387d128c2f759262d33454b209f2aee8a03283a85b027904fd): `successful: true`, ledger `4338159`, `fee_charged: 22973` stroops, source account the fee-sponsor | **The first real payment from a genuinely external seller and buyer, neither one this project.** `agentpayments.fi` published its own resource server against this facilitator (`docs/SELLERS.md`'s documented path, no coordination beyond that), and an independent buyer (`GASW2GBQ4JU4TMTQNJUSW2FM3MO7URW2O44OZJ2XKU6IFHG32JAPEPBO`) paid it: `/effects` shows `0.0010000 USDC` (real testnet USDC, not the self-issued `PTEST` every other row uses) moving from that buyer to the seller's `payTo` (`GBHD27INOTFHFPHVGQMKSW2EGRK3T6E47OHIVR7L44JGHWUJKXIZBXSR`), fee-sponsored by this facilitator exactly as every other row here. Cataloged as a side effect of this exact settlement; confirmed live via `GET /discovery/search?query=conformance` returning `https://agentpayments.fi/api/conformance` as the top result. |
| 2026-08-26 | `stellar:testnet` | `exact` | [`10919a59342fc0cc69d3698a58cf7fb76f3e997914e16562ffa39bbf7f70af28`](https://stellar.expert/explorer/testnet/tx/10919a59342fc0cc69d3698a58cf7fb76f3e997914e16562ffa39bbf7f70af28) | [Horizon](https://horizon-testnet.stellar.org/transactions/10919a59342fc0cc69d3698a58cf7fb76f3e997914e16562ffa39bbf7f70af28): `successful: true`, ledger `4340216`, `fee_charged: 23087` stroops, source account the fee-sponsor | Verifies the `/settle` `extensions`-in-body fix (found live by the seller above): settled through the **actual official `HTTPFacilitatorClient.settle()`**, not a raw `fetch`, the same call path a real seller's resource server uses, confirming `settleResult.extensions` now returns `{ bazaar: { status: "success" } }` instead of nothing, closing the gap [x402-foundation/x402#3270](https://github.com/x402-foundation/x402/issues/3270) reports upstream. See `docs/DEFERRED.md`. |

**`stellar:pubnet`**: not yet attempted, no mainnet fee-sponsor key exists
(none should, until real deployment; see `docs/DEFERRED.md`). Both networks
are still a committed deliverable (spec §2); this row will be added once
Phase 10's mainnet deployment is real.

## What the settled transaction actually proves

Independently checked against Horizon (not just trusted from the script's
own printed output):

- `transactions/{hash}` → `successful: true`, `ledger: 4023444`,
  `source_account` = the facilitator's own fee-sponsor address
  (`GDXULEKCDTYLN2RD7ID7ZTVUJVIDYPJTL7OY7DFN7Z5S4XKFFN6FOFLE`), `fee_charged:
  23067` stroops, **the facilitator paid the fee, not the buyer or
  seller**, confirming fee sponsorship actually happened on-chain, not just
  in the JSON response.
- The seller/`payTo` account's balance shows exactly `0.1000000 PTEST`
  after the transaction: the amount specified in `paymentRequirements`
  (`1000000` in atomic units, 7 decimals) actually moved, to the actual
  recipient.
- The asset is a self-issued test SEP-41 token
  (`CCK2UCUDA2CYGBHIPURM6TIXZEHULBVIGPVB2UTP3R2LCIKB3O5P723X`, a Stellar
  Asset Contract wrapping the classic asset `PTEST` issued by this
  project's own testnet issuer account), not Circle's testnet USDC.
  Circle's faucet requires a browser/CAPTCHA with no API
  (`docs/DEFERRED.md`), so a self-issued token is what made an
  automatable, real settlement possible in this build session. The
  facilitator and `@x402/stellar` treat the asset address as a parameter;
  nothing about the result is specific to this asset over genuine USDC.

## What the settled `upto` transaction actually proves

Also independently checked against Horizon, not just the script's own
printed output: `transactions/{hash}` → `successful: true`,
`source_account` = the fee-sponsor address (facilitator, not buyer or
seller), `fee_charged: 42872` stroops. The `/effects` endpoint shows the
full pull-and-refund sequence in order: buyer debited `0.1 PTEST` (the
signed ceiling), the contract credited then debited `0.04 PTEST` to the
seller (the actual charge) and `0.06 PTEST` back to the buyer (the
refund), the exact partial-settlement arithmetic `scheme_upto_stellar.md`
describes, not just a full payout. A separate post-hoc query
(`stellar contract invoke ... -- balance --id <contract>`) confirms the
contract's own SEP-41 balance is `0`, the "never holds a balance across
transactions" invariant the spec's security section names.

This run also closes the three assumptions `docs/SPEC.md` §6 and the spec
PR mark open, each against real testnet behavior, not simulation-only:

1. **`require_auth_for_args` root tuple + sub-invocation.** The buyer's
   real signed auth entry (inspected via `inspectAuthEntry`, not asserted)
   has root call `argCount=1`, the authorized tuple is `(authorization,)`
   only, `actual_amount` never appears in it, with exactly one
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
(spends a small amount of the test buyer's PTEST balance each run, not
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
- **Updated 2026-08-17**: the official x402 e2e suite itself has now been
  run for real, once, for `exact` on `stellar:testnet`, against the live
  deployment, see the settled-transactions table above and
  [`docs/conformance/2026-08-17-x402-e2e-stellar-exact.md`](../docs/conformance/2026-08-17-x402-e2e-stellar-exact.md)
  for the full transcript. This is real, dated evidence toward Phase 8,
  not a claim that Phase 8's own gate (`docs/SPEC.md` §Phase 8) is met:
  that gate needs **both** networks (`stellar:pubnet` has no fee-sponsor
  key yet, `docs/DEFERRED.md`), a hash **per network, per scheme**, and
  the run selecting Bazaar as an extension, none of which this single
  `exact`/testnet pass alone satisfies. `upto` is not included either: it
  isn't wired into `apps/facilitator`'s HTTP routes yet, so the suite has
  no `upto` scenario to run against Periplo.
