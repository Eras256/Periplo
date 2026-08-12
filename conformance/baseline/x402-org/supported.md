# `x402.org`: `GET /facilitator/supported`

- **Captured:** 2026-08-07T05:23:50Z
- **Command:** `curl -sS -D - -o - https://x402.org/facilitator/supported`
- **Result:** `200 OK`

## Response headers (verbatim)

```
HTTP/2 200
date: Fri, 07 Aug 2026 05:23:50 GMT
content-type: application/json
cf-ray: a273d9fc6d6a8aea-QRO
cf-cache-status: DYNAMIC
age: 0
cache-control: public, max-age=0, must-revalidate
x-vercel-id: sfo1::iad1::dlgjz-1786080229999-3e24c2cb3c2e
server: cloudflare
strict-transport-security: max-age=63072000; includeSubDomains; preload
vary: accept-encoding
x-matched-path: /facilitator/supported
x-vercel-cache: MISS
```

## Response body (verbatim, pretty-printed for readability, no fields added/removed)

```json
{
  "kinds": [
    { "x402Version": 2, "scheme": "exact", "network": "eip155:84532" },
    {
      "x402Version": 2,
      "scheme": "upto",
      "network": "eip155:84532",
      "extra": { "facilitatorAddress": "0xd407e409E34E0b9afb99EcCeb609bDbcD5e7f1bf" }
    },
    { "x402Version": 2, "scheme": "batch-settlement", "network": "eip155:84532" },
    {
      "x402Version": 2,
      "scheme": "exact",
      "network": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      "extra": {
        "feePayer": "CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5",
        "features": { "smartWalletSupported": true }
      }
    },
    {
      "x402Version": 2,
      "scheme": "exact",
      "network": "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe",
      "extra": { "feePayer": "G7QWRIJODICBDG6JAVXNKHNTCKTBJZBXTSCGQLSMXSCIKEJ5SNFPEJSFQQ" }
    },
    {
      "x402Version": 2,
      "scheme": "exact",
      "network": "aptos:2",
      "extra": { "feePayer": "0x1be1a717b48c46c83a2a6a53205aff6123610961560b2b08968a344c4da24b1e" }
    },
    {
      "x402Version": 2,
      "scheme": "exact",
      "network": "stellar:testnet",
      "extra": { "areFeesSponsored": true }
    },
    {
      "x402Version": 2,
      "scheme": "exact",
      "network": "hedera:testnet",
      "extra": { "feePayer": "0.0.9185802" }
    },
    {
      "x402Version": 2,
      "scheme": "exact",
      "network": "xrpl:1",
      "extra": { "areFeesSponsored": false }
    },
    { "x402Version": 1, "scheme": "exact", "network": "base-sepolia" },
    {
      "x402Version": 1,
      "scheme": "exact",
      "network": "solana-devnet",
      "extra": { "feePayer": "CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5" }
    }
  ],
  "extensions": ["builder-code", "eip2612GasSponsoring", "erc20ApprovalGasSponsoring"],
  "signers": {
    "eip155:*": ["0xd407e409E34E0b9afb99EcCeb609bDbcD5e7f1bf"],
    "solana:*": ["CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5"],
    "algorand:*": ["G7QWRIJODICBDG6JAVXNKHNTCKTBJZBXTSCGQLSMXSCIKEJ5SNFPEJSFQQ"],
    "aptos:*": ["0x1be1a717b48c46c83a2a6a53205aff6123610961560b2b08968a344c4da24b1e"],
    "stellar:*": [
      "GC6CSXBV4C6RL3HEDTW57KXYXSSXKAWKGYDEOSATXM3XNKXSR2VRYN3K",
      "GC5OLUZ4WANPN6VT7YGTK2SRMZG762KOVKJXHWIO4K57UBASO2FMNRET"
    ],
    "hedera:*": ["0.0.9185802"],
    "xrpl:*": []
  }
}
```

## Reading this as a conformance spec

- **`network` id form**: CAIP-2 (`stellar:testnet`, `eip155:84532`, ...), matches
  master spec §2 exactly.
- **Stellar `extra` block**: `{ "areFeesSponsored": true }`. Confirms §2's
  "advertise `extra.areFeesSponsored: true`" is literal, not paraphrased,
  reproduce this exact key.
- **Stellar coverage**: `stellar:testnet` only. No `stellar:pubnet` kind is
  advertised by this facilitator today. Periplo committing to both (§2, §13)
  is a superset of the reference, not a deviation from it.
- **Stellar `upto` / `batch-settlement`**: neither scheme is advertised for
  Stellar here (only `exact`). Consistent with master spec §0.1/§6: `upto` on
  Stellar doesn't exist yet anywhere, that's Periplo's Phase 6 contribution.
- **Stellar signers**: two G-accounts listed under `stellar:*`, the
  facilitator's fee-sponsoring signer(s), not a spending key (consistent with
  "sponsors network fees only," §2).
- **`extensions`**: no `bazaar` entry. See `discovery-404.md` in this
  directory for the corresponding endpoint check.
