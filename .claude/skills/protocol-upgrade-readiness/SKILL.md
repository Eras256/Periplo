---
name: protocol-upgrade-readiness
description: >
  Checklist for verifying Periplo actually still works ahead of a Stellar
  protocol upgrade (a new CAP set voted in on testnet first, then mainnet
  weeks later) — which SDK version to bump to and why, whether any code
  does an unsafe exhaustive match on a type the protocol extended, running
  a real settlement cycle against testnet in the live window before the
  mainnet vote, and checking for duplicate findings before filing anything.
  Use when a new Stellar protocol version (Protocol 28, 29, 30, ...) is
  announced or already live on testnet, when deciding whether to bump
  `@stellar/stellar-sdk` or `soroban-sdk`, or when auditing this project's
  own code for a CAP-introduced breaking change.
allowed-tools: [Read, Edit, Write, Grep, Glob, Bash]
---

# Protocol upgrade readiness check

Written 02-sep-2026, right after doing this for real against Protocol 28
("Adapter", CAP-83/85/86), not from theory. Same four steps, in order,
every time. Don't wait for the mainnet vote to start any of them —
testnet gets a new protocol weeks ahead, that window is exactly when this
whole checklist should run.

## 0. Confirm the premise for real, first

Before anything else: `stellar network settings --network testnet` (the
`stellar` CLI itself warns if its own version is behind the network's
protocol — that warning is a real signal, not noise). Don't take an
announcement's dates or CAP list on trust; the official upgrade guide
(`stellar.org/blog/developers/adapter-<name>-protocol-<n>-upgrade-guide`
or equivalent) is the primary source, read it directly.

## 1. Check the whole dependency chain before picking a version — "latest" is often wrong

Never bump `@stellar/stellar-sdk` (or `soroban-sdk`) to npm/crates.io
`latest` reflexively. Instead:

1. Find every package this project depends on that *also* depends on the
   SDK in question — `@x402/stellar` is the one that matters most here.
   Check its **actual published** dependency range (`npm view
   <package>@<installed-version> dependencies`, and separately
   `npm view <package>@latest dependencies` — the newest release of a
   dependency might still lag behind), not what you'd assume from the
   changelog of the SDK itself.
2. If that range doesn't admit the newest major (e.g. `^16.0.1` doesn't
   admit `17.x`), bumping past it splits the install into two
   incompatible major versions of the same package (confirm this by
   checking `pnpm-lock.yaml`/`pnpm list <pkg> -r` for how many distinct
   resolutions exist before and after). This is usually worse than
   staying behind.
3. Check whether the SDK's own project ships a maintenance/LTS line
   specifically for the older major, backporting the new protocol's XDR
   support without the newer major's breaking changes — read the
   **CHANGELOG at the actual LTS tag**, not `main`'s, since LTS entries
   often don't get merged back into `main`'s changelog file at all
   (confirmed real for `js-stellar-sdk`: `main`'s `CHANGELOG.md` has no
   `v16.3.0` section, but `git show v16.3.0:CHANGELOG.md` does).
4. Pick the version that (a) satisfies every dependency's range without
   forcing a split install and (b) actually contains the new protocol's
   XDR/feature support, even if it isn't `latest`. Document *why*, not
   just the version number — a bare version bump with no reasoning is
   exactly the kind of claim this project's evidence discipline exists
   to prevent.
5. For a Rust crate (`soroban-sdk`): check crates.io's real version list
   for whether a *stable* release (not just an `-rc.N`) exists for the
   new protocol yet. If only a release candidate exists, don't bump — an
   RC pin isn't a real target, and note that plainly rather than
   force-picking one.

## 2. Grep for an unsafe exhaustive match on whatever the protocol extended

Every CAP that adds a new variant to an existing enum/union is a
compile-time trap for any code that matches on it without a wildcard arm
(Rust) or exhaustively without a `default`/`_` case (TypeScript). Read
the upgrade guide's own "Breaking changes" section for the exact type
name(s) it calls out (e.g. Protocol 28 / CAP-85 named `ContractExecutable`
directly), then:

1. `grep -rn` that type name (and its host-function/context names —
   `CreateContractHostFn`, `create_contract`, etc.) across **every**
   language this project ships (`apps/*/src`, `packages/*/src`,
   `contracts/*/src`), not just the one you expect. A real "doesn't
   apply" answer, confirmed by an actual empty grep, is a legitimate,
   reportable outcome — don't skip reporting it just because nothing was
   found.
2. If a real dependency this project builds on (not a language SDK, a
   library like a smart-account crate) does the exhaustive match
   instead, check *that* library's actual source at the pinned version,
   not just its docs. If the match currently compiles clean, say exactly
   why (which older SDK pin, which variant count) rather than assuming
   it's already broken or already safe.
3. Rust's own exhaustiveness checking means this class of bug can't ship
   silently there — it's a compile error the day the dependency's own
   pin moves past the point where the enum gains the new variant. That's
   worth stating explicitly: it changes the urgency (a build-time gate,
   not a silent runtime corruption) without changing whether it's worth
   flagging.

## 3. Run the real settlement cycle against testnet, in the live window

Testnet gets a new protocol before mainnet votes on it — that gap is the
actual test window, use it. Don't just read the upgrade guide and assume
compatibility.

1. Enumerate every distinct scheme *and* profile this project actually
   supports (for Periplo: `exact`; `upto`'s `contract` profile both
   direct-against-contract and through the facilitator's own HTTP-route
   code). Run the real demo/verification script for each one, for real,
   against live testnet — not a local simulated host.
2. Independently verify every resulting transaction against Horizon
   (`successful: true`, `source_account` matches the fee-sponsor,
   `fee_charged`), never trust a script's own printed "success" alone.
3. If a script fails, root-cause it before assuming the protocol broke
   something: check whether it's a real protocol incompatibility, or
   just a stale assumption the script itself carries (a hardcoded fee
   ceiling, an old default) that the *deployed* service already handles
   correctly. Fix the script for real if it's the latter, don't just
   work around it for one run.
4. A profile with no prior working cycle (nothing to "re-run") isn't a
   gap in this check — name it as out of scope explicitly, and don't
   attempt to build one from scratch under a protocol-upgrade banner if
   its own blocker is unrelated and already tracked elsewhere. Re-attempting a
   closed, already-exhausted investigation without a genuinely new
   trigger is a separate decision, not something this checklist should
   force.

## 4. Check for an existing report before filing anything

Any real finding from steps 2-3 goes through the normal duplicate check
before it becomes an issue: search the target repo's open *and* closed
issues/PRs for the type name, the function name, and the CAP number.
Same-day, independent duplicate findings are real and likely on a
fast-moving protocol upgrade — this account runs more than one Stellar
project from the same GitHub identity, and more than one of them may hit
the same upstream gap independently. If a matching issue already exists:

- Don't file a second one, even with a different repro angle, if the
  existing one already demonstrates the bug (a stronger repro,
  especially a real compiler/runtime error rather than source reading,
  beats a second issue every time).
- Do add a corroborating comment citing your own independent evidence
  (a different dependency pin, a different code path that hits the same
  root cause) — that's real, additive evidence a second issue wouldn't
  be.
- Fix any of this project's own docs that already assumed nothing was
  filed, rather than leaving them stale once the real state changes.

## Where the evidence goes

Same places every other verified claim in this project lives, not a
separate write-up: the relevant bullet in `README.md`'s "What's real
right now" section (next to whatever prior evidence it's closest to in
subject, e.g. next to an existing upstream-bug entry), a dated paragraph
in `CLAUDE.md`'s Architecture narrative, and new rows in
`conformance/RESULTS.md` for any real settled transaction. Read the
existing surrounding prose before writing to match its register — dense,
evidence-first, no inflated framing. This checklist's own first real run
(Protocol 28, 2026-09-02) is recorded there: commit `32f5d56` (SDK bump
+ testnet cycle), and the corroborating comment on
[OpenZeppelin/stellar-contracts#865](https://github.com/OpenZeppelin/stellar-contracts/issues/865#issuecomment-5515054181).
