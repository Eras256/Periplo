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
| Replay | Nonce in `temporary()` storage + ledger-sequence deadline, checked before any transfer | `contracts/upto-settlement/src/lib.rs` | `contracts/upto-settlement/src/test.rs` (21 unit tests incl. `AuthorizationConsumed`), a real same-nonce replay rejected live on testnet (`Error(Contract, #6)`, `conformance/RESULTS.md`) |
| Fund redirection | Recipient comes from the buyer's signed auth entry (`authorization.to`/`.facilitator`), never from an unsigned argument | `contracts/upto-settlement/src/lib.rs` | `contracts/upto-settlement/src/property_test.rs` (6 proptest properties, ~1,500 randomized cases/run) |
| Facilitator drain | Five facilitator-safety checks (client can't be transaction source, operation source, or `from`; can't appear as a signer in client auth; simulation must show only the expected balance changes), enforced by `@x402/stellar`'s `ExactStellarScheme` internally (not reimplemented here per spec §1), plus a Periplo-specific boot-time check | `apps/facilitator/src/boot-safety.ts`: refuses to construct a `FacilitatorCore` if the configured fee-sponsor key holds any non-native-XLM balance | `apps/facilitator/src/boot-safety.test.ts` |
| Front-running settlement | Facilitator identity is part of the signed authorization (`authorization.facilitator`, its own `require_auth()`), not implied by whoever submits the transaction | `contracts/upto-settlement/src/lib.rs` | `contracts/upto-settlement/src/test.rs`, confirmed live via `inspectAuthEntry` on a real testnet simulation (`apps/facilitator/scripts/upto-settle-demo.ts`) |
| Simulation false-pass | Explicit signature verification independent of simulation, provided by `@x402/stellar` / `soroban-sdk`'s own auth machinery, not reimplemented in this repo (spec §1: build on `@x402/stellar`, don't re-derive verify/settle) | `@x402/stellar` (dependency, not Periplo code) | Exercised transitively by every real settled transaction in `conformance/RESULTS.md`; no Periplo-authored unit test targets this directly, since the control isn't Periplo's own code |
| Injection / SSRF via resource URLs | Reject `null/*` origins, non-http(s)/mcp schemes, and local hosts (`localhost`, `127.0.0.1`, `*.local`) before a catalog write, enforced inside the write path itself, not just at one call site | `packages/bazaar/src/catalog-url.ts` (`checkCatalogUrl`, called from `upsertCatalogResource`) | `packages/bazaar/src/catalog-url.test.ts`, `packages/bazaar/src/db/catalog.test.ts` (proves the gate runs before any DB call), a real `localhost` case in `apps/facilitator/src/discovery.integration.test.ts` against the live Supabase project. Found and closed as a real bug, not designed in from the start: two dead rows in the live catalog, see `docs/DEFERRED.md`'s "Two real, dead-catalog-entry bugs" section |
| Secret leakage | Service-role Supabase key and Stellar fee-sponsor secret are read only from server-side env vars (`STELLAR_FEE_SPONSOR_SECRET*`, `SUPABASE_SERVICE_ROLE_KEY`), never bundled to a client; there is no frontend yet for one to leak into (`docs/SPEC.md` Phase 9, not started) | `apps/facilitator/src/serve.ts`, `packages/bazaar/src/db/client.ts` | **Gap, stated honestly, not claimed done:** `docs/SPEC.md` §6 calls for a dedicated "lint rule + CI grep" for this. No such check exists in `.github/workflows/ci.yml` or the Biome config as of this writing; the mitigation today is structural (no frontend to leak into, secrets never appear in committed code) rather than a CI-enforced gate. Tracked as a real, open gap, not silently dropped from this table |
| Dependency compromise | Committed lockfile, `osv-scanner` reusable workflow, and `packages/licence-check`'s AGPL/copyleft gate, all run on every push | `.github/workflows/ci.yml`, `packages/licence-check` | CI itself (badge in README), `packages/licence-check`'s own unit tests including the real AGPL-3.0-or-later case (OpenZeppelin Relayer) |

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
