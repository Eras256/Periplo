# @periplo/upto-demo

A single page that shows `UptoSettlement` working: the buyer signs a
spending ceiling once, the facilitator settles only real usage, and the
contract refunds the rest in the same transaction. **Stellar testnet
only.** Built for the GOYA HACK 2026 entry and kept as a standalone app.

This is deliberately **not** `apps/hub` (spec §10, Phase 9, not started).
See `docs/DEFERRED.md` for why it exists ahead of that phase.

## What the page shows

1. **Real settlements on testnet.** `settled` events from contract
   `CA7OYVXWPSQHXNBWJQZ7TCKQILAVBHWDAPNRJTKY66LHR5K5LFXRV6TW`, read in the
   browser from the public Soroban RPC (`getEvents`), decoded by
   `src/api/settled-event.ts` and shown as authorized vs. charged vs.
   refunded, each linked to its transaction. Polled every 30 s while the
   tab is visible, resuming from the last RPC cursor. The RPC keeps about
   7 days of events, so older settlements drop off this list.
2. **An in-browser simulation** of the same flow (`src/api/simulation.ts`).
   It sends nothing and is labeled as a simulation everywhere; it never
   produces a transaction hash.

Why the RPC and not an indexer: `api.stellar.expert` answers `403` to any
third-party `Origin` (checked 2026-09-27), while
`soroban-testnet.stellar.org` sends `Access-Control-Allow-Origin: *` and
includes `txHash` in each event.

## Contract and asset

- UptoSettlement: `CA7OYVXWPSQHXNBWJQZ7TCKQILAVBHWDAPNRJTKY66LHR5K5LFXRV6TW`,
  created at ledger 4905262 (tx `2b8084b4bc...`). An isolated deployment,
  separate from `CAK3R734WLT4JU2XMQOJ6NIB3BWGPI442CH44EFJG5AORMXFE7G4MQFW`
  (the one `conformance/RESULTS.md` cites); the two must not share traffic.
- Asset: `PTEST`, a classic testnet asset with no value, SAC
  `CCK2UCUDA2CYGBHIPURM6TIXZEHULBVIGPVB2UTP3R2LCIKB3O5P723X`. Settlements in
  any other SEP-41 token are shown in raw base units, since only PTEST's
  decimals are known here.
- The event layout matches `contracts/upto-settlement/src/lib.rs`
  (`Settled`). The deployed Wasm hash (`110a3758...`) has not been
  checked against a local build of that source.

## Not yet connected

The metered backend (buyer signs, facilitator settles real usage) is being
built separately. Its API is not confirmed, so this page does not call it;
once it exists, the "Pruébalo tú" section can drive real settlements
instead of simulating them, and they will already appear in section 1.

## Commands

```
pnpm --filter @periplo/upto-demo dev       # local dev server
pnpm --filter @periplo/upto-demo build     # static build in apps/upto-demo/dist
pnpm --filter @periplo/upto-demo preview   # serve the build locally
```

Typecheck and tests run through the root gate (`tsc -b` references,
`vitest` picks up `src/**/*.test.ts`).

## Deploying

A static site with no environment variables. Suggested setup on a static
host: root directory `apps/upto-demo`, build command `pnpm build`, output
directory `dist`. Not yet tested on any specific host: the repo pins
`pnpm@11.22.0`, so the host must honor `packageManager` (on Vercel, set
`ENABLE_EXPERIMENTAL_COREPACK=1`).
