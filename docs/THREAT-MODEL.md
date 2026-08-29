# Threat model

This is the same threat/control/test table as `docs/SPEC.md` §6, pulled
into its own file so a reviewer or an Audit Bank auditor can cite it
directly without reading the full build spec first. Nothing here is new:
every row is the same real content, now with a pointer to where the
control actually lives in the codebase and what proves it, not just what
was planned.

**Status:** this is Periplo's own, non-adversarial mapping of threat to
control to test. It is not a substitute for third-party review. See
`docs/DEFERRED.md`'s "Third-party security review: pending via Audit
Bank, status tracked here" for the real, currently-open status of that
separate, adversarial step.

| Threat | Control | Where it lives | Test evidence |
| --- | --- | --- | --- |
| Catalog poisoning via `routeTemplate` | Decode-then-validate, reject traversal/absolute/protocol-relative paths before storage | `packages/bazaar/src/route-template.ts` (`checkRouteTemplate`) | `packages/bazaar/src/route-template.test.ts`, 45 unit tests, gate requires ≥20 |
| Listing spoofing (seller impersonation) | `payTo` is read from the facilitator's own verified `paymentRequirements`, never from client-echoed extension data | `apps/facilitator/src/discovery.ts` | `apps/facilitator/src/discovery.test.ts`, `discovery.integration.test.ts` |
| Replay | Nonce in `temporary()` storage + ledger-sequence deadline, checked before any transfer. The nonce entry's own TTL is derived from `deadline_ledger` at settlement time (`extend_ttl(&key, ttl, ttl)` where `ttl = deadline_ledger - ledger`), not compared against a separately-fixed ceiling, so the entry structurally cannot expire before the authorization itself does; window size is independently bounded by `MAX_WINDOW_LEDGERS = 17_280` (~1 day) | `contracts/upto-settlement/src/lib.rs` | `contracts/upto-settlement/src/test.rs` (29 unit tests incl. `AuthorizationConsumed`, plus `rejects_window_exceeding_the_contract_maximum`/`accepts_window_exactly_at_the_contract_maximum` for the window ceiling), a real same-nonce replay rejected live on testnet (`Error(Contract, #6)`, `conformance/RESULTS.md`), and the TTL-covers-deadline property itself confirmed live (not just in a unit test): a settled transaction's nonce entry `liveUntilLedgerSeq`, read back from RPC, exceeded `deadline_ledger` by exactly the requested margin. See "Independent external validation" below |
| Fund redirection | Recipient comes from the buyer's signed auth entry (`authorization.to`/`.facilitator`), never from an unsigned argument | `contracts/upto-settlement/src/lib.rs` | `contracts/upto-settlement/src/property_test.rs` (6 proptest properties, ~1,500 randomized cases/run) |
| Facilitator drain | Five facilitator-safety checks (client can't be transaction source, operation source, or `from`; can't appear as a signer in client auth; simulation must show only the expected balance changes), enforced by `@x402/stellar`'s `ExactStellarScheme` internally (not reimplemented here per spec §1), plus a Periplo-specific boot-time check | `apps/facilitator/src/boot-safety.ts`: refuses to construct a `FacilitatorCore` if the configured fee-sponsor key holds any non-native-XLM balance | `apps/facilitator/src/boot-safety.test.ts` |
| Front-running settlement | Facilitator identity is part of the signed authorization (`authorization.facilitator`, its own `require_auth()`), not implied by whoever submits the transaction | `contracts/upto-settlement/src/lib.rs` | `contracts/upto-settlement/src/test.rs`, confirmed live via `inspectAuthEntry` on a real testnet simulation (`apps/facilitator/scripts/upto-settle-demo.ts`) |
| Simulation false-pass | Explicit signature verification independent of simulation, provided by `@x402/stellar` / `soroban-sdk`'s own auth machinery, not reimplemented in this repo (spec §1: build on `@x402/stellar`, don't re-derive verify/settle) | `@x402/stellar` (dependency, not Periplo code) | Exercised transitively by every real settled transaction in `conformance/RESULTS.md`; no Periplo-authored unit test targets this directly, since the control isn't Periplo's own code |
| Injection / SSRF via resource URLs | Reject `null/*` origins, non-http(s)/mcp schemes, and local hosts (`localhost`, `127.0.0.1`, `*.local`) before a catalog write, enforced inside the write path itself, not just at one call site | `packages/bazaar/src/catalog-url.ts` (`checkCatalogUrl`, called from `upsertCatalogResource`) | `packages/bazaar/src/catalog-url.test.ts`, `packages/bazaar/src/db/catalog.test.ts` (proves the gate runs before any DB call), a real `localhost` case in `apps/facilitator/src/discovery.integration.test.ts` against the live Supabase project. Found and closed as a real bug, not designed in from the start: two dead rows in the live catalog, see `docs/DEFERRED.md`'s "Two real, dead-catalog-entry bugs" section |
| Secret leakage | Service-role Supabase key and Stellar fee-sponsor secret are read only from server-side env vars (`STELLAR_FEE_SPONSOR_SECRET*`, `SUPABASE_SERVICE_ROLE_KEY`), never bundled to a client; there is no frontend yet for one to leak into (`docs/SPEC.md` Phase 9, not started) | `apps/facilitator/src/serve.ts`, `packages/bazaar/src/db/client.ts` | **Gap, stated honestly, not claimed done:** `docs/SPEC.md` §6 calls for a dedicated "lint rule + CI grep" for this. No such check exists in `.github/workflows/ci.yml` or the Biome config as of this writing; the mitigation today is structural (no frontend to leak into, secrets never appear in committed code) rather than a CI-enforced gate. Tracked as a real, open gap, not silently dropped from this table |
| Dependency compromise | Committed lockfile and `packages/licence-check`'s AGPL/copyleft gate run on every push; `cargo audit`/`pnpm audit` against RustSec/npm advisories run manually, not yet CI-gated | `.github/workflows/ci.yml`, `packages/licence-check` | CI itself (badge in README), `packages/licence-check`'s own unit tests including the real AGPL-3.0-or-later case (OpenZeppelin Relayer). **Correction, stated honestly:** this row previously listed an `osv-scanner` reusable workflow as an active, on-every-push control; it was removed from CI on 2026-08-07 over a malformed call signature and never re-added (`docs/DEFERRED.md`), so it was not actually running when this row first claimed it was. See "Automated static analysis" below for what real coverage exists today instead |

## Independent external validation of the Replay row (2026-08-21)

An implementer unaffiliated with this project, `davedumto`, reviewed
five real Stellar `upto` implementations in source (rail402, Rialto,
openx402, LumenGate, and this project's own `contracts/upto-settlement`
via [x402-foundation/x402#3098](https://github.com/x402-foundation/x402/pull/3098))
against a competing spec PR
([x402-foundation/x402#3134](https://github.com/x402-foundation/x402/pull/3134)),
[posted publicly](https://github.com/x402-foundation/x402/pull/3134#issuecomment-5373783683).
Point 5 of that review names exactly the risk class the Replay row
above addresses: "an authorization can be signed with an
`expiration_ledger` further out than the nonce record's own TTL, which
would let the identical authorization settle again after the nonce
record itself expires, silently reopening replay for the residual,"
citing this project's contract by name (as `#3098`'s reference
implementation) among the implementations that need to answer this.

This project's contract answers it structurally, not by boundary-
checking against a separately-configured TTL the way the review's
cited example (rail402) does: the nonce entry's TTL is *derived from*
`deadline_ledger` at settlement time, so the two values can never
diverge by construction, verified live on testnet (see the Replay row
above). [Replied on the thread](https://github.com/x402-foundation/x402/pull/3134#issuecomment-5383242545)
with the exact code and evidence rather than asserting agreement, and
explicit that this is a different mechanism than rail402's, not a claim
of meeting an identical named test vector. Worth recording here as what
it is: unsolicited, external, source-level review from an independent
implementer, not self-assessment, and it found no gap in this
contract's own handling of the case it raised.

## Automated static analysis, run for real (2026-08-21)

While the Audit Bank engagement is queued and waiting on that program's
own timeline (`docs/DEFERRED.md`'s "Third-party security review"
section, nothing on this project's side can accelerate it), this is the
real coverage available today, for free, with no third party involved.
**This is not a third-party audit and is not presented as one.** It's
automated dependency- and lint-level checking, the kind a CI pipeline
runs on every push at most serious projects, run here manually and
reported honestly, clean results included, rather than left undone
because nothing was found. All three below are exactly the commands
run, not summarized or reworded.

### `cargo audit`: Rust/Soroban contract dependencies vs. RustSec

Run against all three Rust crates in `contracts/` (`upto-settlement`,
`agent-verifier`, `agent-smart-account`), each its own Cargo project.

**No known vulnerable dependencies in any of the three, as of
2026-08-21.** Each scan reports exactly one *warning*, not a
vulnerability: `paste@1.0.15` (RUSTSEC-2024-0436, "no longer
maintained"), pulled in transitively through `soroban-sdk` →
`soroban-env-host` → `soroban-wasmi` → `wasmi_core`, and separately
through `ark-ff`/the `ark-*` cryptography crates `soroban-env-host`
itself depends on. Not a dependency this project chose directly, and
not swappable without a `soroban-sdk` upstream change; noted here as
what it is, not treated as a real finding. `cargo audit`'s own exit
code is `0` for all three crates (only vulnerabilities cause a nonzero
exit, an unmaintained-crate warning does not).

This is not a substitute for a manual review of the RustSec-tracked
attack surface, which `cargo audit` only checks against a database of
already-*reported* advisories; a real audit can find issues that have
never been reported anywhere.

### `cargo clippy`: static lint on the same contract code

Run twice per crate: default (`-W clippy::all`, the standard tier
that catches real logic classes, not just style) against library code
only, then again with `-W clippy::pedantic` added (the strictest
built-in tier, deliberately noisy, many of its lints are stylistic
opinions rather than defects) to see the full range of what's
available.

**`-W clippy::all`, library code only: zero warnings, all three
crates.** (One unrelated line about a failed cache-cleanup permission
error appears in the raw output; that's this sandbox's own `~/.cargo`
directory permissions, not a lint finding, and doesn't appear when
`clippy` is run with write access to its own cache.)

**`-W clippy::pedantic` (stricter, library code only): 15 warnings in
`upto-settlement`, 11 in `agent-verifier`, 3 in `agent-smart-account`.
Every single one is stylistic, not a correctness or security finding:**
`needless_pass_by_value` (Soroban's own `#[contractimpl]` macro
requires `Env`/`Address` parameters to be taken by value, this is the
macro's calling convention, not a bug the contract introduced),
`must_use_candidate` (a getter's return value could be marked
`#[must_use]`), and `doc_markdown` (a handful of doc-comment mentions
of `OpenZeppelin` missing backticks). Running with `--all-targets`
(including `property_test.rs`, test-only code) adds a few more
pedantic-tier float-cast warnings inside the property-test harness
itself (`as f64`/`as i128` conversions used to derive randomized test
amounts), not in any contract logic path.

Not run: `cargo scout-audit` (a Soroban-specific static analyzer,
distinct from `cargo clippy`) and OpenZeppelin's Security Detectors
SDK, both still a real, open gap, `docs/DEFERRED.md`'s Phase 6 section
already names this honestly rather than claiming it here too.

### `pnpm audit`: TypeScript/JS dependencies vs. the npm advisory database

**One real, still-open finding, not swept under the rug:** `tar@6.2.1`,
pulled in as `fastembed`'s own direct dependency (`packages/search` →
`fastembed` → `tar`), flags 12 advisories (1 critical, 8 high, 3
moderate), all published against `tar`'s 7.x line with fixed versions
inside 7.x. A closer look before reporting this at face value: the
advisories' machine-readable version ranges have no explicit lower
bound (`<=7.5.18` rather than, say, `>=7.0.0 <=7.5.18`), which is
exactly the shape that can produce a false match against an
architecturally different, older major version. `tar@6.2.1` was the
final release of the 6.x line (2024-03-21), one day before `7.0.0`
shipped (2024-04-10), a version boundary, not a gradual line still
receiving fixes in parallel. What settles it in the advisories' favor,
not against: `npm view tar@6.2.1 deprecated` returns the package
maintainer's own deprecation notice, verbatim, "Old versions of tar are
not supported, and contain widely publicized security vulnerabilities,
which have been fixed in the current version." That's the maintainer
directly, not an automated range match, confirming this is real.

**A fix was attempted and reverted, not silently left broken or
silently left unfixed without trying.** `fastembed` also reaches `tar`
a second way, through its own `onnxruntime-node` dependency, which
already resolves a patched `tar@7.5.22` in this exact dependency tree.
Forcing `fastembed`'s own direct `tar` dependency to the same,
already-proven-compatible version via a `pnpm-workspace.yaml` override
resolved cleanly (`pnpm audit` → "No known vulnerabilities found") but
broke real, existing functionality: `fastembed@2.1.0`'s own code
imports `tar`'s default export, an export shape `tar@7.x` no longer
provides, crashing `packages/search/src/embed.ts` at import time and
cascading into 5 failing test suites (`SyntaxError: The requested
module 'tar' does not provide an export named 'default'`). Reverted
immediately, confirmed `pnpm run ci` back to green (256 tests) before
moving on. This is `fastembed`'s own unpatched compatibility gap with
`tar@7.x`, not something this repo can close by bumping a transitive
version alone; it needs either an upstream `fastembed` release pinning
a newer `tar`, or replacing the embedding pipeline entirely, both
larger asks than a dependency patch. Tracked here as a real, open,
low-probability risk (exploitable only if a tar archive `fastembed`
extracts, i.e. the downloaded embedding-model artifact, were ever
tampered with at the source), not resolved, not hidden.

`cargo audit`/`cargo clippy`/`pnpm audit` are not wired into CI as of
this writing, run manually for this pass; making them a real, repeating
gate (mirroring `packages/licence-check`'s own pattern, or restoring
`osv-scanner` per the correction above) is a reasonable next step, not
done here since it wasn't the ask.

## What this table intentionally does not cover

This is a threat model for the facilitator, the catalog, and the `upto`
settlement contract as built. It does not cover the developer hub
(`apps/hub`, Phase 9, not started, no attack surface exists yet) or the
smart-account / agent-verifier work in `contracts/agent-smart-account`
and `contracts/agent-verifier`, which is Phase 6b evidence, not a
shipped path: it has unit-test coverage but no real, signed testnet
transaction, a genuinely open blocker tracked in
[OpenZeppelin/stellar-contracts#839](https://github.com/OpenZeppelin/stellar-contracts/issues/839).
Extending this table to that surface only makes sense once it has real
on-chain behavior to threat-model against.

## Related

- `docs/SPEC.md` §6, the original table this file formalizes.
- `docs/DEFERRED.md`, for the full narrative behind every "found as a
  real bug" note above, and the current, honest status of the
  third-party Audit Bank review this internal table is not a substitute
  for.
- `contracts/upto-settlement/README.md`, for the contract's own
  security-relevant design notes (atomicity, the `temporary()`
  storage choice, the `BalanceInvariantViolated` runtime check).
