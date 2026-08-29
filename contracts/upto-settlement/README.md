# upto-settlement

`UptoSettlement`, the Soroban contract behind the x402 `upto` scheme's
`contract` profile on Stellar. Full protocol writeup:
[`specs/schemes/upto/scheme_upto_stellar.md`](https://github.com/x402-foundation/x402/pull/3098)
(open draft PR against `x402-foundation/x402`; this crate is the reference
implementation that PR names). Design rationale and inline comments live
in [`src/lib.rs`](src/lib.rs). This file is just the how-to.

Deployed to `stellar:testnet` at
`CAK3R734WLT4JU2XMQOJ6NIB3BWGPI442CH44EFJG5AORMXFE7G4MQFW`. A real settled
transaction and the three on-chain assumptions this contract's design
depends on, each closed against live testnet behavior, are recorded in
[`../../conformance/RESULTS.md`](../../conformance/RESULTS.md).

## Layout

Flattened relative to `stellar contract init`'s default (which nests a
second `contracts/<name>/` inside this directory, meant for workspaces
with multiple contracts; this repo only ever plans one):

```text
contracts/upto-settlement/
├── Cargo.toml            # single-crate manifest
├── src/
│   ├── lib.rs             # the contract
│   ├── test.rs             # 29 unit tests (mod test, cfg(test))
│   └── property_test.rs    # 6 proptest properties (mod property_test, cfg(test))
├── fuzz/                  # cargo-fuzz target (nightly only, see below)
└── test_snapshots/        # committed regression evidence (test.rs's 21 cases only,
                            # property_test.rs disables snapshot capture; see src/property_test.rs)
```

## Commands

```bash
# Unit + property tests (stable toolchain)
cargo test

# Release WASM build (128KB contract-size ceiling)
cargo build --release --target wasm32v1-none
# or: stellar contract build

# Fuzzing (nightly toolchain; no clang needed, the bundled libFuzzer
# runtime built fine against plain gcc on this machine)
cargo +nightly fuzz run fuzz_settle_arithmetic -- -max_total_time=180
```

## Deploying and settling for real

```bash
stellar keys generate <your-deployer-identity> --network testnet --fund
stellar contract deploy \
  --wasm target/wasm32v1-none/release/upto_settlement.wasm \
  --source-account <your-deployer-identity> \
  --network testnet

# From the repo root, after nvm use 22, real partial settlement against
# whatever contract UPTO_SETTLEMENT_CONTRACT_TESTNET in .env points at:
node --env-file=.env ../../apps/facilitator/scripts/upto-settle-demo.ts
```

The verification script spends a small amount of the test buyer's PTEST
balance each run and prints direct evidence for all three on-chain
assumptions (auth-entry structure via `inspectAuthEntry`, real simulated
resource usage, and the settled nonce entry's TTL read back from RPC):
see the script's own header comment and `conformance/RESULTS.md` for what
a real run showed.
