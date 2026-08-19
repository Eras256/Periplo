# Periplo: Master Build Specification

> This is the governing build document for this repository, adapted from the
> session that kicked off the build (2026-08-06/07) and committed here so it
> survives across sessions instead of living only in chat context. `CLAUDE.md`
> points here. Phase status and environment divergences are tracked separately
> in `docs/DEFERRED.md`. This file is the brief, not the status report; don't
> hand-edit it to reflect progress, update `docs/DEFERRED.md` and
> `conformance/RESULTS.md` instead. Budget figures and submission-process
> administrivia (tranche schedule, form-specific requirements) live in the
> actual SCF submission, not here. This file is engineering scope and gates
> only.

---

## 0. Role and mission

You are the lead engineer building **Periplo**, the discovery layer for
x402-payable services on Stellar. This is a submission to the Stellar Community
Fund **RFP Track**, responding to the open RFP *"X402 Facilitator with Bazaar
(discovery) support"* (SCF #45, Q3 2026).

RFP Track is decided by **panel review only, no community vote**, and
acceptance is tested at the wire level: an unmodified canonical x402 client is
pointed at the service and either completes a payment end to end or it
doesn't. A conformance claim in prose doesn't substitute for that.

**Therefore: conformance at the wire level is the product.** Correct settlement
plus a non-conformant wire format produces an unusable service.

---

## 0.1 Tooling available to you: use it

This machine has **stellar-build** installed: 45 skills in `~/.claude/skills/`,
the Raven MCP server, and a local data layer. Reach for these instead of
recalling Stellar facts from memory.

**Raven MCP** (`stellar-raven`, `https://raven.stellar.buzz/mcp`) is the official
hosted MCP for the Stellar ecosystem, exposing `search` (Stellar docs + ecosystem
discovery) and `execute` (queries against live ecosystem data).
**Query Raven before asserting any Stellar fact**: protocol behaviour, SEP
details, RPC semantics, current network limits. If Raven and this document
disagree, Raven is the live source; note the divergence and update the document.

**Skills to invoke by phase:**

| Phase | Skill | What it gives you |
| --- | --- | --- |
| all | `standards` | SEP/CAP map, ecosystem references, MCP server list |
| 1, 4 | `agentic-payments` | x402 on Stellar: facilitator flow, fee-sponsored clients, MPP. The closest thing to a reference for this build. |
| 2, 5 | `data` | Stellar data access patterns, indexing |
| 3, 10 | `dapp` | JS `stellar-sdk`, transaction building, simulation, error handling |
| 3 | `assets` | SEP-41, the Stellar Asset Contract bridge, trustlines, authorization flags |
| 6 | `smart-contracts` | Soroban contract anatomy, storage/TTL, auth, testing, security. Routes to `development.md`, `testing.md`, `security.md`. |
| 6 | `tyler-architect` | Architect persona for the `UptoSettlement` design review |
| 9 | `dapp` | Freighter and Stellar Wallets Kit for `/playground` |
| 10 | `deploy-stellar-mainnet` | The devnet → mainnet checklist with Soroban-specific gates |
| every gate | `code-review`, `review-edge-case-hunter` | Run both before declaring a gate passed |

**Do not use** the SCF skills (`scf-submission-drafter`, `scf-prescreen-checker`,
`scf-budget-builder`, `scf-competitor-analyst`) during the build. They belong to
the submission workflow, which is a separate task from writing this code.

**Note on the environment:** a `UserPromptSubmit` hook rewrites prompts and a
`PostToolUse` hook traces skill usage locally. Both are expected. Disable with
`STELLAR_BUILD_NO_REPROMPT=1` / `STELLAR_BUILD_NO_TRACE=1` if they interfere with
a debugging session.

---

## 1. Non-negotiable constraints

Violating any of these invalidates the work.

1. **Licence: Apache-2.0.** Every dependency must be compatible with permissive
   redistribution *and* with operating the code as a network service.
   **No AGPL anywhere in the dependency path.** Specifically excluded: the
   OpenZeppelin Relayer, its x402 plugin, and the relayer SDK (AGPL-3.0-or-later).
   Run a licence check in CI and fail the build on any copyleft transitive.
2. **Build on `@x402/stellar` (Apache-2.0). Do not reimplement verify/settle.**
   Settlement on Stellar is solved. The novel work is discovery, the agent-facing
   interface, the `upto` scheme upstream, and conformance.
3. **Non-custodial by construction.** The facilitator never takes custody and is
   never the source of funds. It sponsors network fees only. Tampering with a
   payment must fail signature verification. Assert this at boot: the process
   must refuse to start if configured with a key that can move user funds.
4. **Never use the words "SDK" or "Developer" in the project name, repository
   title, or the top-level description.** Name the capability, not the category.
   (Package directories may use them; the public identity may not.)
5. **No invented scope.** Build only what §3 lists. If you believe something else
   is needed, write it in `docs/DEFERRED.md` and move on.
6. **Every rejection carries a non-null `reason`.** An agent must be able to
   reason about failure without parsing prose.
7. **Honest README.** Never state a capability that lacks a link, a test, or a
   transaction hash. Prefer "not implemented" to an optimistic claim.
8. **Reference repositories are READ-ONLY unless they carry a permissive licence.**
   Most of the Stellar prior art worth studying: `scrimp`, `stellar-mpp-demo`,
   `yardstick-demo`, `Drand-Relay`, `stellar-playground`, `confidential-wallet`
   and others listed in `CLAUDE.md`, publishes **no licence**, which means all
   rights reserved. Public visibility is not permission.

   **You may:** read them, learn the approach, and write your own implementation
   from your own understanding.
   **You may not:** copy code, files or configuration, or add them as a
   dependency.

   Only these six are ✅ dependable: `OpenZeppelin/stellar-contracts` (MIT), and
   `stellar-agent-kit`, `soroban-diagnose`, `stellar-dev-skill`, `fKALE`, `Klink`
   (Apache-2.0). The CI licence gate exists to catch violations of this rule.
   Do not work around it.

---

## 2. Verified dependency manifest

Versions confirmed against the npm registry and crates.io on **2026-08-07**,
**re-verified 2026-08-19** (§11's pre-submission pass, done 8 days late, see
`docs/DEFERRED.md`). Pin these. If a version has moved, update it and note
the change in the commit body. Do not silently drift.

| Package | Version | Licence |
| --- | --- | --- |
| `pnpm` | 11.22.0 | MIT |
| `typescript` | 7.0.2 | Apache-2.0 |
| `vitest` | 4.1.11 | MIT |
| `@playwright/test` | 1.62.1 | Apache-2.0 |
| `@biomejs/biome` | 2.5.9 | MIT OR Apache-2.0 |
| `zod` | 4.4.3 | MIT |
| `hono` | 4.13.3 | MIT |
| `@types/node` | 26.2.0 | MIT |
| `tsx` | 4.23.12 | MIT |
| `@x402/core` · `@x402/stellar` · `@x402/hono` | 2.22.0 | Apache-2.0 |
| `@x402/fetch` | 2.23.0 | Apache-2.0 |
| `@stellar/stellar-sdk` | 16.2.0 | Apache-2.0 |
| `@modelcontextprotocol/sdk` | 1.30.0 | MIT |
| `@supabase/supabase-js` | 2.112.3 | MIT |
| `next` | 16.3.1 | MIT |
| `react` | 19.2.8 | MIT |
| `tailwindcss` | 4.3.3 | MIT |
| `soroban-sdk` (crate) | 27.0.5 | Apache-2.0 |
| `stellar-xdr` (crate) | 27.0.0 | Apache-2.0 |

**2026-08-19 re-verification notes, real deviations from a blind bump, not
silent drift:**
- `@x402/core`/`@x402/stellar`/`@x402/hono` are pinned to **2.22.0**, not the
  actual latest (2.23.0, published 2026-08-18, less than 24 hours old at
  verification time): `pnpm`'s own `minimumReleaseAge` supply-chain check
  flagged 2.23.0 for exactly this reason. This is the real trust-critical
  dependency the deployed fee-sponsor signs through; bypassing that check to
  grab a release published the day before, with no changelog available to
  review what changed, was judged riskier than the two extra weeks of real
  usage 2.22.0 already has. Revisit once 2.23.0 clears a reasonable age.
- `soroban-sdk` stays at **27.0.5**, not the actual latest (27.0.6, a plain
  patch bump): the deployed `UptoSettlement` contract
  (`CAK3R734WLT4JU2XMQOJ6NIB3BWGPI442CH44EFJG5AORMXFE7G4MQFW`) was built and
  verified against 27.0.5 specifically (wasm hash cross-checked live against
  stellar.expert). The contract has no upgrade mechanism, so bumping the
  source pin without redeploying would leave source and the live contract
  mismatched; redeploying a new instance is a bigger, outward-facing decision
  than a version bump, held for explicit confirmation rather than done here.
- `stellar-xdr`'s table entry is corrected from `28.0.0` to **27.0.0**: it
  was never a direct pin, it's resolved transitively by whatever
  `soroban-sdk` version is actually used, confirmed by reading
  `contracts/upto-settlement/Cargo.lock` directly rather than assumed. The
  original `28.0.0` entry was wrong from the start, not a drift.
- `next`/`react`/`tailwindcss`/`@modelcontextprotocol/sdk`/`@playwright/test`:
  re-checked live, `next` moved (16.3.0 → 16.3.1), the rest didn't. None are
  installed anywhere in the codebase yet (Phase 7/9 haven't started), so
  there is nothing to test the bump against; the table reflects the current
  registry latest for whenever they are introduced.

**Node ≥ 22. pnpm workspaces. TypeScript strict, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`.** Biome for lint/format (not ESLint + Prettier).

### `@x402/stellar` public surface: use these, do not re-derive

- `ExactStellarScheme`: client, facilitator and server variants
- `createEd25519Signer(privateKey, defaultNetwork)`: SEP-43 signer implementing
  `SignAuthEntry` and `SignTransaction`
- `ClientStellarSigner`, `FacilitatorStellarSigner`: types
- `getRpcUrl(network, config?)`, `getRpcClient(network, config?)`,
  `getNetworkPassphrase(network)`
- `validateStellarDestinationAddress(address)`, `validateStellarAssetAddress(address)`

Its `src/` contains `exact/` **only**. There is no `upto/`. That is Phase 6.

### Stellar facts that shape the code

- CAIP-2 network ids: `stellar:testnet`, `stellar:pubnet`. Both are committed
  deliverables, never one or the other.
- **Ledger-based expiration, not timestamps.** Default ≈ 12 ledgers ≈ 60 s,
  derived from `maxTimeoutSeconds`. Use the live network estimate for seconds per
  ledger where available; fall back to 5.
- SEP-41 Soroban tokens only. Classic assets are out of scope.
- **USDC on Stellar has 7 decimals**, not 6. Amounts are `i128` strings.
- An account needs a **trustline** before it can receive a SEP-41 asset. Handle
  this in onboarding and examples; surface it as a distinct, actionable error.
- Facilitators sponsor fees: advertise `extra.areFeesSponsored: true`.
- Settlement fee = `simulationResourceFee + inclusionBuffer` (buffer ≥ 100
  stroops), derived from a **fresh settle-time simulation**. Never reuse the
  client's fee bid.
- **Soroban's simulator records `require_auth()` without verifying signatures.**
  Simulation is not authorization verification. Verify signatures explicitly.
- Throughput: the facilitator is the transaction source, so its sequence number
  is the bottleneck under bursty agent traffic. Use **channel accounts**.

---

## 3. Scope: build exactly this

| # | Component | Path |
| --- | --- | --- |
| 1 | Facilitator: `verify`, `settle`, `supported`, both networks | `apps/facilitator` |
| 2 | Bazaar: catalog, automatic cataloging, trust boundary | `packages/bazaar` |
| 3 | Search: hybrid retrieval + measured relevance | `packages/search` |
| 4 | MCP discovery server | `packages/mcp` |
| 5 | Seller / buyer helper libraries | `packages/helpers` |
| 6 | `upto` on Stellar: spec + Soroban contract + upstream impl | `contracts/`, `spec/` |
| 7 | Developer hub (role-based docs + live testnet examples) | `apps/hub` |
| 8 | Conformance harness against the x402 e2e suite | `conformance/` |
| 9 | Two end-to-end example integrations | `examples/` |

### Explicitly NOT in scope

Do not build: an institutional dashboard, an admin console, user accounts,
billing UI, a wallet, a block explorer, analytics beyond operational telemetry,
or any page not required by the developer hub in §10. Scope sprawl is a
documented rejection reason in this programme. If tempted, write it in
`docs/DEFERRED.md`.

### Effort allocation

Not all components carry equal weight. Use this to judge how much depth each
phase deserves. If a phase is running past its allocation, cut scope inside it
rather than borrowing from another. The RFP requires the Bazaar (catalog +
search) to carry the largest share of the total effort, and the allocation
below reflects that.

| Line | Share | Phases |
| --- | ---: | --- |
| Search + relevance evaluation | 25% | 2, 5 |
| Catalog + automatic cataloging + trust boundary | 19% | 1, 4 |
| `upto`: spec + Soroban contract + upstream | 16% | 6 |
| Facilitator on `@x402/stellar`, both networks | 13% | 3 |
| MCP discovery server | 9% | 7 |
| Developer hub | 8% | 9 |
| Conformance + e2e both networks | 5% | 0, 8 |
| Examples + production + runbook | 5% | 10 |

Search is the largest single line, as the RFP requires. The hub is the
smallest meaningful one: it exists because the RFP names it explicitly, not
because a product is being built around it.

---

## 4. Wire contracts: asserted verbatim by the e2e suite

These shapes are validated by `e2e/extensions/bazaar.ts` in the x402 repository.
**Reproduce them exactly. Do not "improve" field names or nesting.**

### `GET /discovery/resources`

Query filters: `type`, `payTo`, `network`, `extensions`, `limit`, `offset`.

```jsonc
{
  "x402Version": 2,
  "items": [
    {
      "resource": "https://seller.example/weather",
      "description": "Current conditions by city",
      "mimeType": "application/json",
      "type": "http",
      "x402Version": 2,
      "accepts": [ /* PaymentRequirements[] */ ],
      "lastUpdated": "2026-08-07T12:00:00.000Z",
      "extensions": { }
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 0 }
}
```

### `GET /discovery/search`

Natural-language `query` (not `q`, confirmed against the official
`@x402/extensions/bazaar` client types and the x402 e2e test's own probe;
this doc originally had `q`, corrected during Phase 4 while reading the
primary source for something else, see `docs/INTEROP.md` §3), cursor
pagination, `partialResults` when matches were truncated. `GET /discovery/*`
itself is Phase 5 (search) work, not built yet.

```jsonc
{
  "x402Version": 2,
  "resources": [ { "resource": "…", "type": "http" } ],
  "partialResults": false,
  "pagination": { "limit": 50, "cursor": null }
}
```

### MCP resources are first class

- Catalog key is the tuple **`resource.url` + `input.toolName`**.
- Expected resource URL form: **`mcp://tool/{toolName}`**.
- `discoveryInfo.input.transport` is `"streamable-http"` or `"sse"`.

### `EXTENSION-RESPONSES` header

Base64-encoded JSON reporting the cataloging outcome, so a seller can tell
whether a listing landed and why not:

```jsonc
{ "bazaar": { "status": "success" } }
{ "bazaar": { "status": "rejected", "rejectedReason": "info failed schema validation" } }
```

### `GET /supported`

Must emit the Stellar `extra` block including `areFeesSponsored`, and accept the
spec `payload: { transaction }` format verbatim.

---

## 5. Phase plan and gates

Commit at the end of every phase with a conventional-commit message. The commit
history is part of the deliverable; reviewers read it.

### Phase 0: Foundation, and measuring the baseline first
Monorepo, Biome, TypeScript strict, Vitest, CI (GitHub Actions), Apache-2.0
LICENSE, `.env.example`, licence-check script that fails on AGPL.

**Before writing any facilitator code, characterise the reference behaviour.**
The public `x402.org` facilitator supports `stellar:testnet` with no API key and
correctly returns `extra: { areFeesSponsored: true }`. Point a stock client at it,
capture every request and response verbatim, and commit the transcripts to
`conformance/baseline/`. That transcript is your specification of "conformant":
it is cheaper to match observed behaviour than to infer it from prose.

Do the same against other multi-chain facilitators claiming Stellar support.
**Advertised support and reachable support are not the same thing**, and any gap
you document is evidence of conformance discipline for the submission.

**Gate:** `pnpm install && pnpm typecheck && pnpm lint && pnpm test` exits 0, and
`conformance/baseline/` contains real captured transcripts.

### Phase 1: Catalog trust boundary
`packages/bazaar`: `routeTemplate` validation and soft-drop extraction.

The facilitator is a trust boundary: clients echo the `resource` block into the
payment payload, so a hostile client can attempt to poison the catalog with
forged metadata or a crafted `routeTemplate`.

**`routeTemplate` must be percent-decoded BEFORE traversal checks.** A naive
`includes("..")` is walked straight past by `%2e%2e`. Decode repeatedly (bounded)
to catch double encoding, normalise backslashes, reject null bytes, absolute URLs
and protocol-relative paths. Return the **original** template as the catalog key:
returning the decoded form would collapse two distinct encodings onto one entry.

Soft-drop: a metadata field failing its rule is dropped; the listing is not
rejected wholesale.

**Gate:** ≥ 20 unit tests pass, including encoded, double-encoded and
backslash traversal, malformed percent-encoding, and `/%2f%2fevil.example`.

### Phase 2: Data layer (Supabase)
Postgres schema, migrations, row-level security, and the retrieval indexes.

```sql
create table resources (
  id            uuid primary key default gen_random_uuid(),
  url           text not null,
  route_template text,
  tool_name     text,
  type          text not null check (type in ('http','mcp')),
  network       text not null,          -- CAIP-2
  pay_to        text not null,
  asset         text not null,
  amount        text not null,          -- i128 as string
  description   text,
  parameters    jsonb default '{}'::jsonb,
  accepts       jsonb not null default '[]'::jsonb,
  extensions    text[] not null default '{}',
  last_updated  timestamptz not null default now(),
  fts           tsvector generated always as (
                  to_tsvector('english',
                    coalesce(description,'') || ' ' ||
                    coalesce(jsonb_path_query_array(parameters,'$.*')::text,''))
                ) stored,
  embedding     vector(512),
  unique (url, route_template, tool_name)
);
create index on resources using gin (fts);
create index on resources using hnsw (embedding vector_ip_ops);
```

RLS: the catalog is public-read; writes only via the service role used by the
facilitator. Never expose the service key to a browser.

**Gate:** migrations apply cleanly to a fresh database; RLS policy tests pass.

### Phase 3: Facilitator
`apps/facilitator` on Hono. `verify`, `settle`, `supported` for `exact` on both
networks, built on `@x402/stellar`.

Validate Soroban auth entries strictly: correctly signed, authorizing exactly the
declared call / asset / amount / recipient, not replayed, not expired. Support
classic keypairs (G-accounts) and custom `__check_auth` accounts (C-accounts).

**Facilitator safety, all of these, or funds are at risk:**
- The client-supplied transaction source MUST NOT be the facilitator.
- The client-supplied operation source MUST NOT be the facilitator.
- The facilitator MUST NOT be the `from` address.
- The facilitator MUST NOT appear as a signer in any client auth entry.
- Simulation MUST emit only the expected balance changes and **no others**.

Testnet is free and needs no API key. Mainnet pricing is configurable, never
hard-wired, so a self-hoster can change or remove it. Document the model.
Caller authentication, metering and rate limiting are your design choice:
document the mechanism and make it configurable.

**Package three deployment paths, all first-class:**
1. **Hosted**: the managed service you operate.
2. **Self-hosted**: someone forks and runs their own instance.
3. **Self-facilitation inside a resource server**: a seller embeds the
   facilitator in their own process and needs no external operator at all.

Path 3 is explicitly required by the RFP and is the one most implementations
forget. Design the package boundaries so it works: the facilitator core must be
importable as a library, not only runnable as a service.

**Do not foreclose `batch-settlement` or `auth-capture`.** Both are deferred
(batch-settlement needs a Soroban escrow, a voucher store, double-spend
prevention and its own audit; `upto` covers the metered case that `auth-capture`
would serve). Keep the scheme dispatch open so either can be added later without
restructuring.

**Gate:** a settled transaction hash on `stellar:testnet`, recorded in
`conformance/RESULTS.md`.

### Phase 4: Automatic cataloging
When the facilitator receives a `PaymentPayload` carrying the discovery
extension, validate `info` against the supplied schema and catalog the resource
**with no separate registration step**. Manual registration may exist only as a
secondary path; anything requiring a seller to act after payment gets skipped.

Catalog both HTTP endpoints and MCP tools. Emit `EXTENSION-RESPONSES`.

**Interoperate: Stellar must not become a walled garden.** A Stellar listing
must be representable consistently with how other facilitators represent theirs.
Take the transcripts captured in Phase 0, diff your catalog entries against how
the same resource appears in a multi-chain facilitator's index, and record any
divergence in `docs/INTEROP.md` with the reason. If a divergence is a bug on
their side, file it upstream: interop bug reports are named in the RFP as a
strong signal of conformance discipline.

Also ship **seller-side helpers** so a resource server declares discovery
metadata correctly with minimal boilerplate, including **per-parameter
descriptions**. Those descriptions are what make an endpoint legible to an agent,
and they are the primary input to search ranking in Phase 5. A seller who omits
them gets found less, so make the helper make them easy.

**Gate:** integration test, a payment carrying the extension results in a
catalog row and a `success` header; a crafted hostile `routeTemplate` results in
a `rejected` header with a specific reason and **no** row.

### Phase 5: Search
`packages/search`. Hybrid retrieval, and the honest measurement of it.

Search quality is a deliverable, not a detail. It is the hardest part of the
scope and the part existing catalogs most often leave unimplemented.

- **Lexical:** Postgres `tsvector` + GIN.
- **Semantic:** pgvector `HNSW` with `vector_ip_ops`, embeddings over the
  discovery `info` structure: resource description, **per-parameter
  descriptions**, and MCP tool schema.
- **Fusion:** Reciprocal Rank Fusion, `1 / (k + rank)` with `k = 50`, separate
  `full_text_weight` and `semantic_weight`. Implement as a single Postgres
  function joining two CTEs with a full outer join.
- **Evaluation:** `eval/golden.jsonl` with graded relevance judgements.
  Compute **nDCG@10** and **MRR** in CI on every release. Publish the number.

**Gate:** `pnpm eval` prints nDCG@10 and MRR over ≥ 30 golden queries, and CI
fails if nDCG@10 regresses more than 5% against the committed baseline.

### Phase 6: `upto` on Stellar
The deepest technical contribution, and the one no other bidder will have.

`upto` requires four properties a SEP-41 allowance cannot provide:
single-use authorization, time bounds, **recipient binding**, and a maximum. An
allowance fails recipient binding (`transfer_from` lets the spender choose any
`to`) and single-use (an allowance is a standing balance). **A contract is
required. Document this reasoning explicitly: it is the argument that
demonstrates you understood the problem rather than the spec.**

Build `contracts/upto-settlement` (Rust, `soroban-sdk` 27.0.5):

- The client signs via **`require_auth_for_args` restricted to
  `(authorization,)`**, excluding `actual_amount`. A plain `require_auth()` would
  authorize the full argument list including the charge, forcing the client to
  know it at signing time and collapsing `upto` into `exact`. This is the
  mechanism that makes `upto` expressible on Soroban.
- Atomic pull-and-refund: auth entries commit to exact sub-invocation arguments,
  so the contract pulls `max_amount` and refunds the remainder in the same
  transaction. No custody window. Assert a zero contract balance at the end.
- Nonce in **temporary** storage. The deadline dominates the nonce: an entry only
  needs to survive until `deadline_ledger`, after which the authorization is
  unusable regardless of nonce state. Bound the window so TTL always covers it.

Then author `spec/scheme_upto_stellar.md` following the structure of
`specs/schemes/exact/scheme_exact_stellar.md`, and prepare the upstream
contribution as `typescript/packages/mechanisms/stellar/src/upto/`, mirroring
the existing `src/exact/`.

**Three assumptions are unverified. Test each on testnet before claiming the spec
is correct; if reality differs, change the spec, not the test:**
1. `require_auth_for_args` accepts a root tuple of `(authorization,)` while the
   token transfer rides as a sub-invocation for `max_amount`.
2. Pull → pay → refund fits inside Soroban's per-transaction read, write,
   instruction and memory limits.
3. `temporary()` TTL can always cover `deadline_ledger − current_ledger`.

**Gate:** `cargo test` passes; contract deployed to testnet; a settled `upto`
transaction hash recorded; each of the three assumptions is a passing test or a
documented spec change.

### Phase 7: MCP discovery server
`packages/mcp` on `@modelcontextprotocol/sdk` 1.30.0. Let an agent search the
Stellar Bazaar and make a paid call from inside an agent runtime, wrapping the
discover → pay → retry loop behind MCP tools:

- `search_services`: natural-language query over the Bazaar
- `call_paid_service`: proxy that handles the 402 loop

Structured, deterministic inputs and outputs with machine-readable error codes.

**Gate:** the server registers in Claude Desktop / any MCP client and completes a
paid testnet call end to end.

### Phase 8: Conformance
This is the acceptance criterion. Treat it as the highest-value phase.

Register Periplo with the x402 e2e suite as an external proxy:
`e2e/facilitators/external-proxies/periplo/` containing `run.sh` and:

```json
{
  "name": "periplo",
  "type": "facilitator",
  "language": "typescript",
  "protocolFamilies": ["stellar"],
  "x402Versions": [2],
  "extensions": ["bazaar"],
  "environment": {
    "required": ["PORT", "STELLAR_SECRET", "STELLAR_NETWORK"]
  }
}
```

The runner must be a CLI parseable from `run.sh`, listen on the given port, emit
the expected logs, and exit 0 on success / 1 on failure.

**Acceptance requires all of:**
- An **unmodified canonical client** completes a payment end to end on **both** networks.
- `/supported` emits the Stellar `extra` contract including `areFeesSponsored`.
- The spec `payload: { transaction }` format is accepted verbatim.
- A passing run of the x402 repo's e2e suite for both networks.
- A published settled transaction hash **per network, per scheme**.
- A non-null `reason` on every rejection.

Record every result in `conformance/RESULTS.md` with hashes and timestamps.

**Gate:** the e2e suite passes with Periplo selected as facilitator, Stellar as
protocol, and Bazaar as extension.

### Phase 9: Developer hub
`apps/hub` on Next.js 16.3.0 + Tailwind 4.3.3. See §10 for exact scope.
**Gate:** Playwright E2E covers each role path; Lighthouse accessibility ≥ 95.

### Phase 10: Examples, deployment, hardening

**Two end-to-end example integrations**, both runnable from a clean clone:
1. A paid API that becomes discoverable and gets paid **by an agent**.
2. An MCP-driven agent that **discovers and pays with no pre-baked integration**:
   this is the one that proves the Bazaar earns its existence.

Fly.io deployment to both networks, runbook, monitoring, public telemetry endpoint.

**Security review routes through the Audit Bank**, not your own budget. v1 ships
no new Soroban contract on the settlement path, so the review covers an off-chain
service and its cryptographic validation rather than a full contract audit.
Scope it that way when you apply. The `UptoSettlement` contract is a separate,
smaller review. Audit fees are **not** an eligible budget line; the Audit Bank is
a distinct programme.

**Public communication channels.** The RFP asks for a commitment to regularly
update the community, and suggests open-source and decentralised channels.
Set up a **Matrix** room and a **Mastodon** or **Bluesky** account before launch,
link them from the hub, and commit to a stated cadence in `docs/MAINTENANCE.md`.
This is cheap, it is explicitly requested, and skipping it is a gratuitous
deduction.

**Gate:** both networks live; `/health` green; runbook rehearsed once; example 2
completes discovery → payment with zero prior integration.

---

## 6. Security requirements

Implement and test each. A test that proves the attack is blocked is worth more
than a paragraph saying it is.

| Threat | Control | Test |
| --- | --- | --- |
| Catalog poisoning via `routeTemplate` | Decode-then-validate, traversal rejection | Phase 1 suite |
| Listing spoofing (seller impersonation) | Bind listings to the verified payer; never trust client-echoed `payTo` | Integration |
| Replay | Nonce + ledger deadline, enforced before settlement | Contract test |
| Fund redirection | Recipient read from signed auth entry, never from an argument | Contract + facilitator test |
| Facilitator drain | The five safety checks in Phase 3 | Adversarial fixtures |
| Front-running settlement | Facilitator binding in the authorization | Contract test |
| Simulation false-pass | Explicit signature verification independent of simulation | Unit test with an unsigned payload |
| Injection / SSRF via resource URLs | HTTPS-only, no private ranges, no redirects followed | Unit test |
| Secret leakage | Redact in logs; no service key in any client bundle | Lint rule + CI grep |
| Dependency compromise | Lockfile committed, `osv-scanner`, licence gate | CI job |

Run `osv-scanner` and a licence audit in CI. Fail on any AGPL transitive.

---

## 7. Testing matrix

| Layer | Tool | Requirement |
| --- | --- | --- |
| Unit | Vitest 4.1.10 | ≥ 85% line coverage on `packages/*` |
| Contract | `cargo test` | Every error variant has a test |
| Fuzz | `cargo-fuzz` | ≥ 3 targets on authorization decoding and amount arithmetic |
| Integration | Vitest + testnet | Verify, settle, catalog, search against live RPC |
| Search relevance | custom harness | nDCG@10, MRR, fixed seeds, CI regression gate |
| E2E (web) | Playwright 1.62.1 | Each developer-hub role path |
| E2E (protocol) | x402 e2e suite | Both networks, `exact` and `upto`, Bazaar extension |
| Security | adversarial fixtures | Every row of §6 |
| Load | k6 or autocannon | Bursty agent traffic; prove channel accounts remove the sequence bottleneck |

---

## 8. Deployment

**Facilitator → Fly.io.** Two apps: `periplo-testnet`, `periplo-mainnet`.

```toml
# fly.toml
[http_service]
  internal_port = 8402
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1        # never 0, cold start breaks agent latency SLOs
  [http_service.concurrency]
    type = "requests"
    soft_limit = 200
    hard_limit = 400

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1

[checks.health]
  type = "http"
  path = "/health"
  interval = "15s"
  timeout = "2s"
```

Secrets via `fly secrets set`, never in `fly.toml`. The mainnet app must fail to
boot if a signing key capable of moving user funds is present.

**Hub → Vercel or Fly static.** **Database → Supabase**, `pgvector` and full-text
enabled, RLS on.

**Targets:** ≥ 99% uptime on public endpoints. Discovery queries are fast
lookups; verify/settle latency suits interactive agent use. State the degraded
path for settlement and for indexing separately.

Publish operational telemetry: requests served, error rate, latency p50/p95,
catalog size. Aggregate only.

---

## 9. Privacy and user protection

The submission form asks for this explicitly. Answer it with architecture:

- **No PII. No cookies. No IP retention.** Aggregate operational metrics only.
- Self-hosted telemetry; no third-party analytics on the hub.
- Anchor hashes, never raw request bodies.
- Collecting nothing personal is a stronger answer than any privacy policy, and
  it reduces GDPR exposure to approximately nothing.

---

## 10. Developer hub: exact scope

This exists because the RFP names it: *a role-based developer guide modeled on
the Algorand x402 developer hub, organized around what the reader is building,
with at least a seller path, a buyer and agent path, and an operator path, each
linking live testnet examples so a developer can run the flow.*

Build these pages and **no others**:

| Route | Purpose |
| --- | --- |
| `/` | What Periplo is, in one screen. Live catalog count. Links to the three paths. |
| `/sellers` | Make an endpoint payable and discoverable. Copy-paste snippet, per-parameter metadata, how to confirm the listing landed via `EXTENSION-RESPONSES`. |
| `/buyers` | Pay for a service from code or an agent runtime. Client setup, trustline step, the 402 loop. |
| `/operators` | Self-host the facilitator. Configuration, fee model, channel accounts, runbook. |
| `/browse` | Human view of the catalog: search box, filters (`type`, `network`, `payTo`), result cards showing price, asset and parameters. |
| `/playground` | Run a real testnet payment in the browser. Wallet connect, pick a catalogued service, pay, see the settled hash. |
| `/status` | Operational telemetry: uptime, latency p50/p95, error rate, catalog size, last settled transaction per network. |
| `/conformance` | The e2e results table with transaction hashes per network per scheme. |

**Design requirements:** server components by default, no client JS on docs
pages, dark and light themes, keyboard-navigable, WCAG AA contrast, all code
blocks copyable, every claim linked to a hash or a test. Target: a developer gets
from the hub to a paid, discoverable endpoint appearing in the Bazaar in **well
under an hour**, that is a stated RFP requirement, so instrument it and measure
it once with a real first-time user.

No marketing page. No pricing page. No sign-up. No dashboard.

---

## 11. Documentation deliverables

- `README.md`: honest status, verify-it-yourself commands, architecture diagram
  in Mermaid, licence.
- `docs/ARCHITECTURE.md`: the diagram plus a plain-English explanation of the
  stack. Both are required by the submission form.
- `docs/DECENTRALIZATION.md`: the index is off-chain by design; an on-chain
  Soroban registry adds rent that must be extended or entries are evicted, and
  per-payment anchoring roughly doubles settlement cost. Decentralization is
  achieved through **replicability**: permissive licence, first-class
  self-hosting, and an interoperable catalog format, so no operator is a single
  point of failure. State this position explicitly rather than leaving it implied.
- `docs/INFRASTRUCTURE.md`: what runs where, and who pays for it after the grant.
- `docs/MAINTENANCE.md`: how conformance is maintained as the discovery
  conventions evolve under the x402 Foundation: how spec changes are monitored,
  how quickly conformance updates ship, and what happens at grant end. **Drift,
  not inability, is the failure mode this RFP screens for.**
- `docs/PRIVACY.md`: §9, as a document.
- `docs/INTEROP.md`: how a Periplo listing maps to how other facilitators
  represent the same resource, with every divergence and its reason.
- `conformance/RESULTS.md`: the evidence table.
- `conformance/baseline/`: the Phase 0 transcripts from the reference facilitator.
- `docs/DEFERRED.md`: everything deliberately not built, with reasons.

**Stellar tech stack currency.** The RFP requires the most recent stable release.
The manifest in §2 was verified on 2026-08-07; before submission, re-verify each
pinned version and state the verification date in the README. A stale pin is a
small thing that signals a large one.

---

## 12. Working rules

1. **One phase per session block.** Do not start a phase until the previous gate
   passes. Report the gate command and its exit code before proceeding.
2. **Never claim a passing test you have not run.** Run it, paste the output.
3. **If a documented API does not behave as this spec describes, trust reality.**
   Update the spec, note the divergence in the commit body, and continue.
4. **Commit at every gate.** Conventional commits. The history is a deliverable.
5. **When blocked, write the blocker in `docs/DEFERRED.md` and continue with
   everything that does not depend on it.** Do not stall the whole build on one
   unknown.
6. **Ask before adding any dependency not in §2.** Then verify its licence.
7. **All code, comments, commit messages and documentation in English.**

---

## 13. Definition of done

- [ ] `pnpm install && pnpm typecheck && pnpm lint && pnpm test` exits 0
- [ ] `cargo test && cargo clippy -- -D warnings && cargo fmt --check` exits 0
- [ ] Facilitator live on `stellar:testnet` and `stellar:pubnet`
- [ ] Settled transaction hash published per network, per scheme
- [ ] Unmodified canonical client completes a payment on both networks
- [ ] x402 e2e suite passes with Bazaar extension selected
- [ ] `GET /discovery/search` returns ranked results; nDCG@10 published
- [ ] Automatic cataloging works; hostile `routeTemplate` rejected with a reason
- [ ] MCP server completes a discover → pay → retry loop in an agent runtime
- [ ] `scheme_upto_stellar.md` opened as an upstream PR
- [ ] `UptoSettlement` deployed to testnet with the three assumptions resolved
- [ ] Developer hub live, all eight routes, accessibility ≥ 95
- [ ] Two example integrations runnable from a clean clone, one of them an agent
      that discovers and pays with **no pre-baked integration**
- [ ] Facilitator usable three ways: hosted, self-hosted, self-facilitated in-process
- [ ] `docs/INTEROP.md` shows a Periplo listing beside another facilitator's
- [ ] Security review complete via the Audit Bank, findings resolved
- [ ] Matrix room and Mastodon/Bluesky account live, linked from the hub
- [ ] No AGPL in the dependency path, verified in CI
- [ ] Every README claim carries a link, a test, or a hash
- [ ] Every pinned version in §2 re-verified, with the date stated in the README
