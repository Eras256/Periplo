---
name: upstream-github-check
description: >
  Run the recurring "what changed upstream?" sweep over every GitHub
  issue/PR Periplo tracks (its own filed bugs and fix PRs, the `upto`
  convergence threads, the Phase 6b blockers), diff live state against
  the last recorded check, investigate what actually moved, and write
  the result into the repo's own docs. Use when asked "alguna novedad de
  GitHub", "revisa los issues upstream", "GitHub state check", after a
  notification about a tracked issue, or whenever more than a couple of
  days have passed since the last recorded sweep.
allowed-tools: [Read, Edit, Write, Grep, Glob, Bash]
---

# Upstream GitHub state check

Periplo's SCF evidence depends on ~40 cited GitHub issues/PRs staying
accurate: its own filed bugs, its fix PRs, the `upto` spec-convergence
threads, and the Phase 6b `agent-smart-account` blockers. The submission
is locked; a reviewer clicking a stale link on a future date is the only
lever left, so the cited state has to be re-verified, not assumed.

`packages/evidence-check` already runs the *mechanical* half on every
push (every cited tx hash still `successful: true` on Horizon, every
cited issue/PR link still resolves, every internal doc link still on
disk, `GET /supported` still live). This skill is the *narrative* half
it can't do: what changed in status, comments, and merge mechanics since
the last sweep, and what that means.

## 1. Derive the tracked list (never hand-maintain it)

The list of tracked items is exactly the GitHub issue/PR links cited in
the repo's own evidence docs. Re-derive it every run:

```bash
grep -rhoE 'https://github\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+/(issues|pull)/[0-9]+' \
  README.md docs/DEFERRED.md docs/UPTO-CONVERGENCE.md conformance/RESULTS.md CLAUDE.md \
  | sed 's#https://github.com/##' | sort -u
```

Add the four convergence anchors if not already present: `#3097`
(the `upto` issue), `stellar/x402-stellar#72`, plus whatever
`docs/UPTO-CONVERGENCE.md`'s tail section is currently pointing at.

## 2. Find the last recorded check

- `git log --oneline -- docs/DEFERRED.md | grep -i "github state\|state check"`
  finds the prior sweep commit (e.g. `a3a9571`, 2026-09-07).
- The memory file `periplo-post-submission-status.md` carries a dated
  entry per sweep; read its most recent one for the baseline.
- Note the date. Everything with `updated_at` after it is a candidate
  change.

## 3. Fetch live state, one batch

```bash
gh api "repos/<owner>/<repo>/issues/<n>" --jq \
 '"\(.state) \(.state_reason // "") merged=\(.pull_request.merged_at // "no") | \(.title) | updated=\(.updated_at)"'
```

Loop it over the derived list (see the shape in `a3a9571`'s own working
notes if still in scratch, or just re-write the loop). Then:

- Sort by `updated_at`. Anything after the last-check date gets a real
  look: `gh issue view <n> --repo <r> --comments`,
  `gh pr view <n> --repo <r> --json state,mergedAt,reviewDecision,mergeStateStatus,statusCheckRollup`.
- For Periplo's own open fix PRs, check CI (`statusCheckRollup`) and
  `reviewDecision` / `mergeStateStatus`. A green PR sitting `BLOCKED` /
  `REVIEW_REQUIRED` is waiting on a maintainer. Record how long it's
  been waiting and a nudge threshold (~2 weeks), don't nudge early.

## 4. Investigate what moved: the lessons that keep recurring

- **"Resolved upstream" / "closed" is a prompt to read the actual merge
  mechanism, not just the open/closed bit.** `#3270` was closed by a
  maintainer's own PR (`#3306`) that *rejected* the community PRs' field
  shape; `#1215` was closed by a maintainer's own PR (`#1218`) that
  *matched* the proposed fix. Same "closed completed", opposite meaning
  for what Periplo's code should do next. Read the closing PR's diff.
- **A finding can turn out wrong.** `#840` (fee-abstraction) got a
  complete, sound rebuttal from brozorec after the counter-example; the
  right move was to correct `DEFERRED.md` from "not resolved either way"
  to "resolved and wrong, do not reopen", not to keep it as an open
  grievance. When a maintainer's explanation holds, say so plainly.
- **`author: Eras256` does not mean Periplo.** The identity is shared
  with Nirium, Contextio, Kumply. `#3171`, `stellar-dev-skill#96`/`#97`
  are Nirium's. The user's own tracking board is the authority: ask,
  don't infer from the author field or a local checkout path.
- **Local `git log` is not `origin`, and a prior read is not the
  source.** `git fetch` and compare against `origin/main` before
  reporting a commit as pushed; re-fetch any issue/PR the same turn
  before citing it, even if read earlier in the session.
- **Convergence threads are traction evidence, not just status.** When a
  third party cites `#3098` as a spec base or credits a section to
  `@Eras256`/`@HeylmStoned` (e.g. `#3428` section 7.5), that belongs in
  README's top-of-file convergence section and `docs/UPTO-CONVERGENCE.md`
  as a dated entry, framed as adoption, not a passing mention. Verify
  the credit against the real PR body first.

## 5. Write it up

- **Substantive changes** (a fix merged, a finding resolved, a new
  citation) each get their own targeted commit editing the specific doc
  that carried the stale claim: `docs/DEFERRED.md` for findings,
  `README.md` + `docs/UPTO-CONVERGENCE.md` for convergence, `CLAUDE.md`'s
  Architecture / upstream-bugs narrative where it names the item.
- **The sweep itself** gets a dated entry appended to the memory file
  `periplo-post-submission-status.md` (not a repo doc unless the
  2026-09-07 `a3a9571` pattern of a small `DEFERRED.md` note is wanted):
  what was checked, what changed with commit hashes, forward-looking
  watch-items with dates, and one line confirming everything else
  unchanged.
- **Em-dash discipline** applies to every doc edit: rewrite per sentence
  (comma / period / colon), never a find-and-replace, never introduce a
  a literal em dash. Verbatim reviewer quotes (whawk46's) keep their
  original em dashes on purpose. Check added lines:
  `git diff | grep '^+' | grep -c $'\xe2\x80\x94'` must be `0`.
- **Commit + push.** A docs-only change correcting a state independently
  verified true (via `gh`, this turn) goes straight to `main` with the
  user's per-instance go-ahead, same criterion as `a3a9571`. Branch
  first only if the change is non-trivial. Conventional-commit format,
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Then
  `git fetch && git log --oneline -1 origin/main` to confirm the push
  actually landed.

## Reporting shape

Match the established format: **novedades reales** (per item: what
changed, the link, what it means for Periplo), then **sin cambios**
(the rest of the list, one line), then **watch-items** with dates. A
sweep that finds nothing is still a valid report: say so, don't invent
movement. Respond in español mexicano (the user's standing preference).

## Current watch-items (update these as they resolve)

- `x402-foundation/x402#3338`, Periplo's settlement-override-ceiling
  fix PR. CI green, `BLOCKED`/`REVIEW_REQUIRED`. Nudge threshold
  ~2026-09-15 if still no maintainer review.
- `OpenZeppelin/stellar-contracts#868` ("Smart account: auth payload
  digest"), merged 2026-09-10 (`4529d708`, closes `#876`). Redefines the
  `Signer::Delegated` nested entry (an `AuthDigestPreimage` struct, not
  the raw digest) and confirms the 2026-09-02 raw-digest construction was
  wrong, but ships only in the unreleased `0.8.0` and adds no
  multi-`ContextRule` delegate test, so the two-context
  `UnvalidatedContext #3002` blocker stays open. Next trigger: the
  `0.8.0` crates.io release. Check
  `curl -s https://index.crates.io/st/el/stellar-accounts | tail -1`;
  when `0.8.0` appears, that is the go-ahead to bump the pin and re-run
  the two-context `settle()` (user decision 2026-09-10: wait for the
  release, do not pin a git rev). Full writeup in `docs/DEFERRED.md`
  Phase 6b watch-item.
- `OpenZeppelin/stellar-contracts#865`, Protocol 28 non-exhaustive
  `ContractExecutable` match. No maintainer response since 2026-09-02.
  Corroborating comment already left; no separate issue (Nirium's repro
  is stronger). Only act if OpenZeppelin moves.
