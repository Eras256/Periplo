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

## Build verification

Two independent mechanisms, both scoped only to this contract, neither
triggered on push or pull_request (they never touch `ci.yml`'s own gate
or the Vercel deploy trigger). They answer different questions and are
not substitutes for each other ([SEP-58](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0058.md)'s
own framing): SEP-55 is "did a trusted CI attest to building this
exact wasm", SEP-58 is "can anyone, independent of that CI, rebuild the
same bytes".

### SEP-55: build attestation (what stellar.expert reads)

[`.github/workflows/upto-settlement-build-attestation.yml`](../../.github/workflows/upto-settlement-build-attestation.yml)
delegates to the real, published
[`stellar-expert/soroban-build-workflow`](https://github.com/stellar-expert/soroban-build-workflow)
(`release.yml`, pinned to commit
[`88068ec5`](https://github.com/stellar-expert/soroban-build-workflow/commit/88068ec50cba931a96436869727ed08edeb76ade),
not `@main`), scoped to `contracts/upto-settlement`. It triggers only on
a published GitHub Release or manual `workflow_dispatch`.

A test release
([`sep55-attestation-test-v1`](https://github.com/Eras256/Periplo/releases/tag/sep55-attestation-test-v1),
clearly labeled as a workflow test, not a contract version) ran it once
for real: [green run](https://github.com/Eras256/Periplo/actions/runs/36370214523).
It built `upto_settlement_v0.1.0.wasm` (hash
`26e51757e90f98428f4b024539fe86701b57367f8469afa7663928bb790cc636`,
different from the deployed contract's `110a3758...`, expected: this is a
fresh CI build of the same source, not a redeploy), published it to a
derived release
([`sep55-attestation-test-v1_contracts_upto_settlement_upto-settlement_pkg0.1.0_cli27.0.0`](https://github.com/Eras256/Periplo/releases/tag/sep55-attestation-test-v1_contracts_upto_settlement_upto-settlement_pkg0.1.0_cli27.0.0)),
and produced a GitHub build attestation for it.

**To verify the attestation:**

```bash
gh release download sep55-attestation-test-v1_contracts_upto_settlement_upto-settlement_pkg0.1.0_cli27.0.0 \
  --repo Eras256/Periplo
gh attestation verify upto-settlement_v0.1.0.wasm --repo Eras256/Periplo
```

Confirmed for real, not assumed: the raw attestation record (`gh api
/repos/Eras256/Periplo/attestations/sha256:26e51757...`) is a well-formed
in-toto/SLSA provenance statement, whose subject digest matches the released
wasm exactly, `predicateType` is `https://slsa.dev/provenance/v1`,
`builder.id` is
`https://github.com/stellar-expert/soroban-build-workflow/.github/workflows/release.yml@88068ec50cba931a96436869727ed08edeb76ade`
(the exact pinned SHA above), and it carries a Rekor transparency-log
inclusion proof. `gh attestation verify`'s own cryptographic check against
Sigstore's infrastructure did not complete in the sandboxed session that
produced this doc (network to `sigstore.dev`/`rekor.sigstore.dev` itself
answered fine; the command's own verification step failed with a bare
`Error: verifying with issuer "sigstore.dev"` regardless of `--owner` vs
`--repo`, and the cause wasn't pinned down further). Re-run the two
commands above from a normal terminal to get the actual green checkmark;
don't take this doc's word for that specific step.

### SEP-58: reproducible container build, twice

[`.github/workflows/upto-settlement-containerized-build.yml`](../../.github/workflows/upto-settlement-containerized-build.yml)
(`workflow_dispatch` only) builds inside
`docker.io/stellar/stellar-cli@sha256:ccdebe3bd4af47e01f275c3da6caeb2752d02b06bc8bc1b3db534432498810c0`
(`26.1.0`, `amd64`, a single-architecture digest, not the multi-arch
manifest list), per [SEP-58](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0058.md)
Appendix A: resolves the image's own Rust toolchain first (so an
in-source `rust-toolchain.toml` can't silently swap it), then
`stellar contract build --optimize` with `--meta` for `bldimg`, `bldopt`
(one entry per flag), `source_uri`, and `source_sha256`. `source_uri`
points at the same durable release asset already published for the
deployed contract's exact source
([`upto-settlement-source-7d13b59`](https://github.com/Eras256/Periplo/releases/tag/upto-settlement-source-7d13b59)):
the source tree hasn't changed since that commit, confirmed with
`git diff --quiet 7d13b59 HEAD -- contracts/upto-settlement` before
reusing it.

Run twice
([run 1](https://github.com/Eras256/Periplo/actions/runs/36370742640),
[run 2](https://github.com/Eras256/Periplo/actions/runs/36370809369)),
both green, both producing the identical hash
`c179a525ee66ad78e43661b90e37dd84518a4944ca727e8a5b7f948a9c98c8f5`
(downloaded and re-hashed locally in two separate directories, not just
read off the CI log). `stellar contract info meta` on the result confirms
all four SEP-58 fields landed in the `contractmetav0` section:

```
bldimg: docker.io/stellar/stellar-cli@sha256:ccdebe3bd4af47e01f275c3da6caeb2752d02b06bc8bc1b3db534432498810c0
bldopt: --manifest-path=contracts/upto-settlement/Cargo.toml
bldopt: --optimize
source_uri: https://github.com/Eras256/Periplo/releases/download/upto-settlement-source-7d13b59/upto-settlement-7d13b59.tar.gz
source_sha256: bc889c1be2b930c887b9a43199ad2dcefd2528264bf011b864e32daee511e5a3
```

This hash (`c179a525...`) is different from both the deployed contract's
`110a3758...` and the SEP-55 workflow's own `26e51757...` above, and that
is expected: three different build environments (a bare host, GitHub's
generic `ubuntu-latest` runner via the SEP-55 workflow's own uncontainerized
`rustup update`, and this pinned container) produce three different byte
sequences from the identical source, which is exactly the problem `bldimg`
digest-pinning exists to close for future deployments. Neither of these
two new hashes has been deployed anywhere; the live contract at
`CAK3R734WLT4JU2XMQOJ6NIB3BWGPI442CH44EFJG5AORMXFE7G4MQFW` is untouched.
