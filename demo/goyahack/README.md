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

## Reproducible build

The deployed WASM at `CA7OYVXWPSQHXNBWJQZ7TCKQILAVBHWDAPNRJTKY66LHR5K5LFXRV6TW` was
fetched back from testnet and independently rebuilt from source, twice, with
byte-identical results.

**What's deployed.** `stellar contract fetch --id
CA7OYVXWPSQHXNBWJQZ7TCKQILAVBHWDAPNRJTKY66LHR5K5LFXRV6TW --network testnet`
returns a WASM whose SHA-256 is
`110a3758f141d7e9684063c4990042b3cc027b03000672a11f199f3db778c243`, matching
the hash stellar.expert shows for this contract. `stellar contract info meta
--wasm-hash 110a3758...` reports the embedded `soroban-sdk` build metadata
(automatically emitted by the SDK, not something this project added):
`rsver: 1.97.1`, `rssdkver: 27.0.5#ea54f95d3f2f49e0487b29fd1a9f469638f09aba`.
No `bldimg`/`bldopt`/`source_sha256` SEP-58 fields are embedded in the WASM
itself; this contract predates adding them (see the proposal below).

**Reproducing it from source, without redeploying.** The WASM was built from
commit
[`7d13b59`](https://github.com/Eras256/Periplo/commit/7d13b59d7d512a91b1fc7e2e6d76d3fa7365aea4)
(the tip of `main` at deploy time), using host `rustc 1.97.1` / `cargo
1.97.1` (matching the embedded `rsver`) targeting `wasm32v1-none`, with
`soroban-sdk 27.0.5` pinned in `Cargo.lock` (matching the embedded
`rssdkver`). Three independent rebuilds all reproduced the exact deployed
hash:

```bash
# 1. A clean checkout of just the contract's source tree at that commit
git archive --format=tar.gz --prefix=upto-settlement-7d13b59/ \
  7d13b59:contracts/upto-settlement > upto-settlement-7d13b59.tar.gz
sha256sum upto-settlement-7d13b59.tar.gz
# bc889c1be2b930c887b9a43199ad2dcefd2528264bf011b864e32daee511e5a3

# 2. Extract into a fresh directory and build with a fresh target dir
tar -xzf upto-settlement-7d13b59.tar.gz -C /some/clean/dir
cd /some/clean/dir/upto-settlement-7d13b59
cargo build --locked --release --target wasm32v1-none

# 3. Compare
sha256sum target/wasm32v1-none/release/upto_settlement.wasm
# 110a3758f141d7e9684063c4990042b3cc027b03000672a11f199f3db778c243  ← matches
```

The third rebuild used that same `upto-settlement-7d13b59.tar.gz`, but
downloaded fresh from the published [GitHub Release asset](https://github.com/Eras256/Periplo/releases/download/upto-settlement-source-7d13b59/upto-settlement-7d13b59.tar.gz)
below (`source_uri`) rather than the local file: its bytes matched the
local archive's SHA-256, and rebuilding from it reached the same
`110a3758...` a third time.

**SEP-58 fields** ([`ecosystem/sep-0058.md`](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0058.md),
Draft v0.6.0), recorded here rather than in the WASM, per the SEP's own §3
("useful for retrofitting metadata onto already-deployed contracts"):

| field | value |
| --- | --- |
| `source_sha256` | `bc889c1be2b930c887b9a43199ad2dcefd2528264bf011b864e32daee511e5a3` |
| `source_uri` | [`github.com/Eras256/Periplo/releases/download/upto-settlement-source-7d13b59/upto-settlement-7d13b59.tar.gz`](https://github.com/Eras256/Periplo/releases/download/upto-settlement-source-7d13b59/upto-settlement-7d13b59.tar.gz), a durable, immutable GitHub Release asset (not an on-the-fly source archive, which the SEP says not to rely on since those bytes can change). Downloaded back and re-verified: its own SHA-256 matches `source_sha256` above, and rebuilding straight from it reproduces the deployed WASM's hash a third time. |
| `bldopt` | `--locked` |
| `bldimg` | Not provided. This rebuild ran directly on the host toolchain (`rustc`/`cargo` 1.97.1), not inside a digest-pinned container. SEP-58 states `bldimg` "has no default; when absent it must be supplied externally to make a rebuild possible", so this is real, twice-confirmed evidence that this source produces this WASM in a matching toolchain, but it is not a fully conformant SEP-58 record: a verifier without the same host Rust version installed cannot yet reproduce it byte-for-byte from these fields alone. |

**This is honest, not a "verified" badge.** stellar.expert's own "Build
Verified" status reads [SEP-55](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0055.md)
GitHub Attestations produced by the `stellar-expert/soroban-build-workflow`
CI action, tied to a specific GitHub Actions run, not SEP-58's on-wasm
`--meta` vocabulary directly (confirmed against Stellar Docs' own Contract
Explorer page and the `soroban-build-workflow` repo, not assumed). This
contract has neither a SEP-55 attestation nor embedded SEP-58 fields today;
what's above is a manual, independently reproducible rebuild anyone can
redo with the commands shown, not an explorer-displayed "verified" badge.
