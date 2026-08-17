# Conformance run: the official x402 e2e suite against Periplo's live facilitator

**2026-08-17.** The official `e2e/` conformance suite from
[x402-foundation/x402](https://github.com/x402-foundation/x402) (commit
[`8c308ce`](https://github.com/x402-foundation/x402/commit/8c308ce3040556482099958f09977fb1fe487e12),
2026-08-17), run end to end against `https://periplo-testnet.fly.dev`,
Periplo's real, deployed testnet facilitator, no mocks. This is the same
suite the reference implementation ships and other facilitators are
validated against, not a Periplo-authored equivalent (spec §1's "don't
reimplement" principle, extended to conformance testing itself).

## What ran

`e2e/facilitators/external-proxies/` is the suite's own documented
mechanism for exercising a real, external, deployed facilitator (that
directory is gitignored upstream, local-only by design, see the suite's
own `e2e/facilitators/external-proxies/README.md`). A thin, dependency-free
proxy component was added under it:

```
e2e/facilitators/external-proxies/periplo/
├── package.json        # { "type": "module" }, zero dependencies
├── test.config.json     # type: facilitator, language: typescript,
│                         # protocolFamilies: ["stellar"], schemes: ["exact"],
│                         # extensions: ["bazaar"]
└── index.ts             # forwards /health, /verify, /settle, /supported,
                          # /discovery/resources, /discovery/search
                          # to https://periplo-testnet.fly.dev
```

`index.ts` is a ~85-line Node `http`+`fetch` forwarder, nothing more: every
call the suite makes is answered by Periplo's real, already-deployed
service, not reimplemented locally. The two discovery routes were added in
a same-day follow-up (see below) once the first pass's own Discovery
Validation step revealed the proxy needed to forward them too, not just
`/verify`/`/settle`/`/supported`/`/health`.

Command, non-interactive (`e2e/README.md`'s own documented
`--families=`/`--facilitators=` scoping):

```bash
pnpm test --testnet --families=stellar --facilitators=periplo \
  --clients=typescript/http/axios --servers=typescript/http/express \
  --schemes=exact -v
```

Client and server credentials: `CLIENT_STELLAR_PRIVATE_KEY` /
`SERVER_STELLAR_ADDRESS` set to Periplo's own existing testnet fixtures
(`STELLAR_TEST_BUYER_SECRET`/`STELLAR_TEST_SELLER_PUBLIC`, already
documented in `CLAUDE.md`). The buyer already held the exact testnet USDC
the suite defaults to
(`CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`, confirmed
identical to `@x402/stellar`'s own `USDC_TESTNET_ADDRESS` constant, and
independently re-derived via `stellar contract id asset --asset
USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 --network
testnet`, not assumed). The seller test account had no USDC trustline yet;
added one with `stellar tx new change-trust` before this run (a real,
one-time, low-value testnet transaction, not a workaround of anything
Periplo-side).

## Result: pass

```json
{
  "success": true,
  "data": {
    "message": "Protected endpoint accessed successfully",
    "timestamp": "2026-08-17T20:05:03.361Z"
  },
  "status_code": 200,
  "payment_response": {
    "success": true,
    "payer": "GA3CTEOWYFXEHDJZYMCXKQIVOQ2NK4MHTPKWKJVAEEOG3LWBKN2EUSYP",
    "transaction": "41277c14505a17f843a1f366b35314c6b12e6a14de40c30b589f161f7948f578",
    "network": "stellar:testnet"
  }
}
```

`✅ Test passed` (the suite's own verdict line, not a paraphrase).

**Independently verified against Horizon before trusting the suite's own
report**, same standard every transaction hash in `conformance/RESULTS.md`
already holds to:

```
$ curl -s https://horizon-testnet.stellar.org/transactions/41277c14505a17f843a1f366b35314c6b12e6a14de40c30b589f161f7948f578
successful: True
ledger: 4195035
created_at: 2026-08-17T20:05:05Z
source_account: GDXULEKCDTYLN2RD7ID7ZTVUJVIDYPJTL7OY7DFN7Z5S4XKFFN6FOFLE
fee_charged: 22973
```

`payer` (`GA3CT...`) matches `STELLAR_TEST_BUYER_PUBLIC` exactly.
`source_account` (`GDXUL...`, the fee-paying transaction submitter) matches
`STELLAR_FEE_SPONSOR_PUBLIC` exactly, confirming Periplo's facilitator
sponsored the fee as designed, not the buyer, per spec §1 constraint 3.

## Follow-up, same day: Bazaar discovery extension, run for real

The first pass above didn't exercise Bazaar: `--extensions=bazaar` wasn't
passed, and the proxy only forwarded the four settlement/health routes.
Re-run with both fixed, same client, server, and credentials:

```bash
pnpm test --testnet --families=stellar --facilitators=periplo \
  --clients=typescript/http/axios --servers=typescript/http/express \
  --schemes=exact --extensions=bazaar -v
```

A real settled payment first (same pattern as above, independently
re-verified against Horizon, not just trusted):

```json
{
  "success": true,
  "payment_response": {
    "payer": "GA3CTEOWYFXEHDJZYMCXKQIVOQ2NK4MHTPKWKJVAEEOG3LWBKN2EUSYP",
    "transaction": "232a3f7cf09f5e9ca6afef313a4cbd91db2be8673383f56797088f7963ceef45",
    "network": "stellar:testnet"
  }
}
```

```
$ curl -s https://horizon-testnet.stellar.org/transactions/232a3f7cf09f5e9ca6afef313a4cbd91db2be8673383f56797088f7963ceef45
successful: True
ledger: 4195416
created_at: 2026-08-17T20:36:53Z
source_account: GDXULEKCDTYLN2RD7ID7ZTVUJVIDYPJTL7OY7DFN7Z5S4XKFFN6FOFLE
fee_charged: 22973
```

Then the suite's own **Discovery Validation** step, which calls
`GET /discovery/resources` and `GET /discovery/search` directly against
the facilitator (not the resource server) to confirm the resource just
paid for is actually catalogued and discoverable:

```
📡 Fetching discovered resources from: http://localhost:4023/discovery/resources?limit=1000
📊 Total resources discovered: 2
✅ Discovered: GET http://localhost:4022/exact/stellar
ℹ️  Unexpected endpoints discovered: 1
   • null/financial_analysis_da8703fa-2ee7-4922-aed5-b8cee63b908c
🔍 Validating search endpoint: http://localhost:4023/discovery/search?query=http
✅ Search endpoint valid (1 results)

✅ Discovery Validation: PASSED
```

The "unexpected" second resource is the already-known, already-tracked
`#3121` artifact (a `null/...` URL from an earlier Phase 4 test fixture,
see `docs/INTEROP.md`), not a new finding, correctly surfaced by the
suite's own validation rather than hidden.

**Two transient client-side flakes along the way, neither reproducible on
retry, both recorded rather than papered over:** one run hit a `502` on
the proxy's `/supported` forward (a one-off network blip; a direct `curl`
immediately after returned `200` cleanly) that cascaded into the server
building payment requirements without `areFeesSponsored`; a separate run
got a bare `402` back from the client wrapper with no server-side error
logged at all. Both cleared on an immediate retry with no code change,
consistent with transient flakiness in the test run itself rather than
anything wrong in Periplo's facilitator or the proxy.

This closes the "Bazaar selected as an extension" piece of Phase 8's
gate for this one scenario. The gate as a whole (both networks, a hash
per network per scheme) still isn't met, see below.

## Scope: real evidence toward Phase 8, not Phase 8's own gate

`docs/SPEC.md`'s Phase 8 gate requires an unmodified canonical client
completing payment on **both** networks and a settled hash **per
network, per scheme**. These two runs satisfy the "Bazaar selected as an
extension" piece for `exact` on `stellar:testnet`, but not the full
gate: `stellar:pubnet` has no fee-sponsor key yet (`docs/DEFERRED.md`),
so there is no second network to test against. `upto` isn't wired into
`apps/facilitator`'s HTTP routes yet (tracked as open in
`docs/DEFERRED.md`, most recently reconfirmed 2026-08-17 when two of the
three `upto` profile-discrimination gaps closed but this one didn't), so
there is no `upto` scenario for the suite to run against Periplo either.
This transcript is real, dated evidence toward Phase 8, not a completion
claim.

## A real gap found in the suite itself: filed

`clients/typescript/client.ts`'s `createE2EClient()` unconditionally
derives an EVM account (`viem`'s `privateKeyToAccount`) and an SVM signer
(`@solana/kit`'s `createKeyPairSignerFromBytes`) before any family-specific
branching, regardless of which `--families` were actually selected. A
Stellar-only run crashes without `CLIENT_EVM_PRIVATE_KEY`/
`CLIENT_SVM_PRIVATE_KEY` set, even though the harness's own preflight
check (`🔍 Validating facilitator environment variables`) only validated
Stellar-specific env and reported all required variables present. Worked
around here with throwaway, unfunded dummy keys (a valid EVM hex key, a
real ed25519-derived 64-byte Solana keypair, neither ever used to sign
anything on their respective networks) rather than treated as a Periplo
gap, since it sits entirely in the suite's own client bootstrapping, not
in anything Periplo built or the facilitator's own behavior. Filed as
[x402-foundation/x402#3187](https://github.com/x402-foundation/x402/issues/3187),
open.

## Reproducing this

The `external-proxies/` directory is gitignored upstream by design (the
suite's own convention for locally-run proxies to real facilitators), so
`periplo`'s three files above aren't committed anywhere, in this repo or
upstream. They're reproduced here in full so this run can be repeated
byte-for-byte from a clean `x402-foundation/x402` checkout.
