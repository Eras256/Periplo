# Periplo × GOYA HACK — metered `upto` settlement demo

Stellar track submission. This is a demo built on top of Periplo
([github.com/Eras256/Periplo](https://github.com/Eras256/Periplo)), not a
new project: it shows the `upto` payment scheme (a buyer signs a spending
*ceiling*, the facilitator settles only the *real* amount used) against a
small metered API, entirely on `stellar:testnet`.

## What was reused (built before this hackathon's window)

- The `UptoSettlement` Soroban contract's code:
  [`contracts/upto-settlement`](../../contracts/upto-settlement).
- The `upto` facilitator mechanics (auth-entry handling, simulate-then-settle):
  [`apps/facilitator/src/upto-stellar-scheme.ts`](../../apps/facilitator/src/upto-stellar-scheme.ts).
- The Stellar SDK contract-client pattern this demo's script is based on:
  [`apps/facilitator/scripts/upto-settle-demo.ts`](../../apps/facilitator/scripts/upto-settle-demo.ts).

## What was built this week for GOYA HACK

- **A new deployment of the contract**, a separate instance from any
  contract this project cites elsewhere, deployed fresh to `stellar:testnet`
  for this entry:
  - Contract ID: `CA7OYVXWPSQHXNBWJQZ7TCKQILAVBHWDAPNRJTKY66LHR5K5LFXRV6TW`
  - Deploy transaction: [`2b8084b4bc811d7c48d3e0e092f70c7ef6fd71a96237a5f43a84db744c1343d6`](https://stellar.expert/explorer/testnet/tx/2b8084b4bc811d7c48d3e0e092f70c7ef6fd71a96237a5f43a84db744c1343d6)
- **A metered demo API**: a small in-process HTTP server
  ([`apps/facilitator/scripts/goyahack-metered-settle-demo.ts`](../../apps/facilitator/scripts/goyahack-metered-settle-demo.ts))
  that answers a dataset query and bills per row actually returned, not a
  flat rate.
- **A client script** that has the buyer sign an `upto` ceiling *before*
  the query runs, calls the metered API for real, then settles for the
  *real* usage against the new contract instance above.
- **A real settlement transaction**, generated today, on `stellar:testnet`:
  - Transaction hash: `cf33b51350f6e4c871b3f0a36e2151ad895dadbe2e237ef413259cf4a0533823`
  - [View on stellar.expert (testnet)](https://stellar.expert/explorer/testnet/tx/cf33b51350f6e4c871b3f0a36e2151ad895dadbe2e237ef413259cf4a0533823)
  - Signed ceiling: `1,000,000` stroops (up to 20 rows)
  - Actually settled: `500,000` stroops (10 rows genuinely matched and returned)
- **A second real settlement, in testnet USDC**, on the same contract
  instance (the asset travels inside each signed authorization; the
  contract was not redeployed):
  - Transaction hash: `d554adfb8f41efca8a5c14d7c82ded1330d3819bddd610ead51ab78257c5cafb`
  - [View on stellar.expert (testnet)](https://stellar.expert/explorer/testnet/tx/d554adfb8f41efca8a5c14d7c82ded1330d3819bddd610ead51ab78257c5cafb)
  - Asset: testnet USDC, issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`,
    SAC `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` (7 decimals,
    read from the SAC's own `decimals()`)
  - Signed ceiling: `1,000,000` base units (0.10 USDC); actually settled:
    `500,000` (0.05 USDC). The contract's balance of both PTEST and USDC
    is `0` after settling, so it never holds user funds.

The gap between the signed ceiling and the settled amount is the whole
point: the buyer commits to a maximum up front, without knowing the exact
usage yet, and only the real, metered usage moves on-chain — the rest is
never charged.

## Running it yourself

From the repo root, with Node ≥22 and a `.env` populated per
[`.env.example`](../../.env.example) (`STELLAR_FEE_SPONSOR_SECRET`,
`STELLAR_TEST_BUYER_SECRET`, `STELLAR_TEST_SELLER_PUBLIC`,
`STELLAR_TEST_ASSET_ADDRESS`, all testnet-only test identities):

```bash
nvm use 22
node --env-file=.env apps/facilitator/scripts/goyahack-metered-settle-demo.ts
```

To settle in testnet USDC instead, override the asset for that run:
`STELLAR_TEST_ASSET_ADDRESS=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`.

This is `stellar:testnet` only. No mainnet key or mainnet contract is
involved anywhere in this demo.
