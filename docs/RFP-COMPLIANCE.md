# RFP Track requirements, mapped to real evidence

The SCF RFP Track's own general requirements and the "X402 Facilitator
with Bazaar" listing's specific evaluation criteria, quoted from the
[SCF Handbook's RFP Track page](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/rfp-track),
mapped one line at a time to what this repo actually contains. No
invented section numbers: the RFP listing itself is prose, not a
numbered clause list, so each row below quotes the real requirement
text and links real evidence, the same "link, test, or hash, never a
bare assertion" standard the rest of this repo uses. **Covered** means
real, verified, dated evidence exists; **Partial** means real work
exists but doesn't fully close the requirement; **Open** means nothing
real exists yet, stated plainly rather than hidden.

## General RFP Track requirements (apply to every submission in this track)

| Requirement (quoted) | Status | Evidence |
| --- | --- | --- |
| "examples of past dev-focused work, and share open-sourced repos if possible" | Covered | This repo itself, Apache-2.0, public since Phase 0. |
| Clear technical explanation with diagrams | Covered | [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) (Mermaid diagram + plain-English walkthrough), [`docs/SPEC.md`](SPEC.md) (the full phased build spec). |
| "Clear, testable milestones" | Covered | [`docs/SPEC.md`](SPEC.md)'s phase gates, each ending in a real command with a real exit code; `CLAUDE.md`'s dated per-phase entries. |
| Post-launch maintenance plan | Covered | [`docs/MAINTENANCE.md`](MAINTENANCE.md). |
| Decentralization explanation | Covered | [`docs/DECENTRALIZATION.md`](DECENTRALIZATION.md): the index is off-chain by design, decentralization comes from replicability (permissive licence, first-class self-hosting, an interoperable catalog format), not an on-chain registry. |
| Infrastructure transparency | Covered | [`docs/INFRASTRUCTURE.md`](INFRASTRUCTURE.md), [Deployment](../README.md#deployment-what-actually-runs) in README.md: Fly.io, Supabase, exact machine/plan specifics, not vague. |
| User privacy / tracking plan | Covered | [`docs/PRIVACY.md`](PRIVACY.md): no PII, no cookies, no IP retention, aggregate-only telemetry (see `GET /status` below). |
| Community update commitment | Partial | `docs/SPEC.md` §10 commits to a Matrix room and a Mastodon/Bluesky account "before launch"; neither is set up yet (Phase 10, not started), stated in `docs/DEFERRED.md`, not hidden. |
| "Most recent stable release of the Stellar tech stack" | Covered | CLAUDE.md's 2026-09-02 Protocol 28 readiness entry: `@stellar/stellar-sdk` bumped to the newest LTS-compatible release, checked against `@x402/stellar`'s own pin, a real testnet cycle run under Protocol 28 before the mainnet vote. |
| Open licensing, "commitment to building in the open" | Covered | Apache-2.0 repo-wide, enforced by `packages/licence-check` in CI (fails the build on any AGPL/copyleft transitive dependency). |

## X402-specific evaluation criteria

| Criterion (quoted) | Status | Evidence |
| --- | --- | --- |
| Technical capability, understanding "specific behaviors" (discovery filters, `routeTemplate` validation, `areFeesSponsored`, auth entry expiration) | Covered | `routeTemplate`: `packages/bazaar`'s `checkRouteTemplate` (decode-then-validate, stricter than upstream, [`docs/INTEROP.md`](INTEROP.md) §1). `areFeesSponsored`: enforced end to end, `apps/facilitator/src/core.ts`. Auth entry expiration: `upto-stellar-scheme.ts`'s `SIGNATURE_EXPIRATION_LEDGER_TOLERANCE` handling and the `require_auth_for_args` 180-day ceiling finding ([x402-foundation/x402#3341](https://github.com/x402-foundation/x402/issues/3341)). |
| Discovery design: concrete cataloging and search approach | Covered | `packages/bazaar` (catalog, trust boundary) + `packages/search` (hybrid lexical/semantic retrieval, RRF fusion), real measured relevance: nDCG@10 0.9346 / MRR 0.9226 against a deliberately hard 55-resource fixture set (`eval/`), not a toy benchmark. |
| "Conformance discipline and upkeep" with spec evolution plans | Covered | `conformance/baseline/` (captured transcripts against the real reference facilitator), the official `x402-foundation/x402` e2e suite run for real (`docs/conformance/`), `packages/evidence-check` (a CI gate that re-verifies every cited hash/link on every push, so the evidence table can't silently rot), and a running count of upstream spec/SDK bugs found and filed (see the "upstream bugs" list in `CLAUDE.md`, ten-plus at last count, most independently verified before filing). |
| Relevant payment infrastructure experience | Covered | The `upto` payment scheme itself: spec text merged upstream ([x402-foundation/x402#3098](https://github.com/x402-foundation/x402/pull/3098)), a real Soroban contract (`contracts/upto-settlement`, deployed, fuzzed, property-tested), wired into this facilitator's own HTTP routes with a real partial settlement on testnet. |
| Security track record and threat modeling | Covered | [`docs/THREAT-MODEL.md`](THREAT-MODEL.md) (spec §6's table, each row pointing at real code and a real test); one honest gap stated there (no CI-enforced secret-leakage check yet), not hidden. Third-party review (Audit Bank) not yet applied for, tracked in `docs/DEFERRED.md`. |
| Ecosystem alignment and coordination willingness | Covered | Two direct competitors in this same round built on the `upto` spec this project opened rather than fork their own ([`README.md`](../README.md#the-ecosystem-is-converging-on-this-spec-not-the-other-way-around), [`docs/UPTO-CONVERGENCE.md`](UPTO-CONVERGENCE.md)); a real external seller (`agentpayments.fi`) integrated with no coordination beyond public docs. |
| Delivery timeline feasibility | Covered | `CLAUDE.md`'s dated, phase-by-phase history is itself the timeline evidence: every phase gate, every real transaction, dated and checkable, not asserted after the fact. |

## Infrastructure & operational requirements

| Requirement (quoted) | Status | Evidence |
| --- | --- | --- |
| "Public endpoints target 99 percent or better uptime," "public operational telemetry or dashboards" | Covered | `GET /status` on the live facilitator (uptime, latency p50/p95, error rate, catalog size, last settled transaction per network), self-hosted, aggregate-only (spec §8/§9). No historical uptime percentage is claimed yet (the endpoint is new, 2026-09-03; a real percentage needs real elapsed time to measure, not a number invented on day one). |
| "Interoperate with the wider x402 discovery ecosystem. Stellar listings should be representable consistently." | Covered | Two distinct kinds of evidence, not conflated: (1) catalog/listing representability — [`docs/INTEROP.md`](INTEROP.md) documents where Periplo's Bazaar listings diverge from upstream's own reference behavior and why (stricter `routeTemplate` validation, a real upstream `mcp://` canonical-URL bug found and filed). (2) Wire-protocol interoperability with a genuinely independent facilitator — `apps/facilitator/scripts/interop-x402-org-demo.ts`: a payment built and signed with this project's own client code was verified **and settled** through `x402.org`'s independent, third-party reference facilitator, not this project's own, confirmed on Horizon with **their** fee-sponsor as the source account, not ours (`conformance/RESULTS.md`, 2026-09-03). |
| Soroban resource limits (reads ≤ 200/tx), TTL-based storage, no reentrancy | Covered | `contracts/upto-settlement`'s real simulation numbers (392 read bytes, far under limits, `conformance/RESULTS.md`), `extend_ttl` calls sized to `MAX_WINDOW_LEDGERS`, and Soroban's own no-reentrancy guarantee relied on directly (no defensive reentrancy guard needed, noted in the contract's own doc comments). |
| "How sequence number bottlenecks are avoided under load, for example channel accounts" | Covered | `createFacilitatorCore`'s `channelAccountSecrets` pool (`apps/facilitator/src/core.ts`), real evidence: 4 concurrent `settle()` calls against a 4-account pool all succeeded in the **same ledger** using 4 distinct source accounts (`conformance/RESULTS.md`, 2026-09-03). An honest documented limit alongside it: concurrency safety extends exactly to pool size, oversubscription fails closed per colliding call, not silently. |

## What's genuinely still open, stated plainly

- **`stellar:pubnet` isn't live.** No mainnet fee-sponsor key exists yet
  (spec commits to both networks as deliverables, not "either/or," but
  building mainnet infrastructure ahead of real funds is a distinct,
  later decision, not an oversight — `docs/DEFERRED.md`).
- **`apps/hub` (Phase 9, the developer hub the RFP names by name) hasn't
  started.** `/status` above ships as a JSON endpoint on the facilitator
  itself, not the full rendered dashboard page spec §10 describes; that
  page would consume this same endpoint once the hub exists.
- **Phase 7 (MCP discovery server) hasn't started**, named as next in
  `CLAUDE.md`'s own status line.
- **Community channels (Matrix, Mastodon/Bluesky) aren't set up.**
- **Third-party security review (Audit Bank) hasn't been applied for.**
- **A measured, historical uptime percentage doesn't exist yet** — the
  endpoint that would report it (`GET /status`) only just shipped.

None of the above is hidden: every item is also tracked, with the same
or more detail, in [`docs/DEFERRED.md`](DEFERRED.md) and
`CLAUDE.md`'s own phase-status line.

---

*This document is maintained alongside real changes, not written once
and left stale — see `packages/evidence-check`'s CI gate, which
re-verifies every hash and link cited here on every push, the same as
every other evidence table in this repo.*
