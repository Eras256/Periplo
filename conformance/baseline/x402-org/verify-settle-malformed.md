# `x402.org`: `POST /facilitator/verify` and `POST /facilitator/settle`

- **Captured:** 2026-08-07T20:58:08Z
- **Purpose:** Phase 3 needs the exact accepted request shape and the exact
  response shape for `verify`/`settle`, not just `/supported`. Same
  philosophy as Phase 0: point a request at the reference facilitator and
  read the real response rather than infer it from `@x402/core`'s TypeScript
  types alone (the types were read too, `x402Client-CzZlbbXy.d.ts`, but
  this is the empirical confirmation).

## Request (identical body sent to both endpoints, deliberately malformed:
this only proves the request *shape* is accepted, not that a valid payment
was verified)

```json
{
  "x402Version": 2,
  "paymentPayload": {
    "x402Version": 2,
    "accepted": {
      "scheme": "exact",
      "network": "stellar:testnet",
      "asset": "x",
      "amount": "1",
      "payTo": "x",
      "maxTimeoutSeconds": 60,
      "extra": {}
    },
    "payload": {}
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "stellar:testnet",
    "asset": "x",
    "amount": "1",
    "payTo": "x",
    "maxTimeoutSeconds": 60,
    "extra": {}
  }
}
```

## `POST /facilitator/verify` → `200 OK`

```json
{ "isValid": false, "invalidReason": "invalid_exact_stellar_payload_malformed" }
```

## `POST /facilitator/settle` → `200 OK`

```json
{
  "success": false,
  "network": "stellar:testnet",
  "transaction": "",
  "errorReason": "invalid_exact_stellar_payload_malformed"
}
```

## Reading this as a conformance spec

- Both endpoints return **`200`, not `400`**, for a well-formed-but-invalid
  payment: the HTTP status communicates "the facilitator processed your
  request," not "your request validated." Validity is carried entirely in
  the JSON body (`isValid` / `success`).
- `VerifyResponse.invalidReason` and `SettleResponse.errorReason` are both
  populated here: matches spec §1 constraint 6 ("every rejection carries a
  non-null reason") and confirms it's honored at the wire level by the
  reference implementation itself, not just asserted in prose.
- `SettleResponse.transaction` is present even on failure, as `""`: always
  include the field, empty string rather than omitting it.
- Top-level request shape confirmed exactly:
  `{ x402Version, paymentPayload, paymentRequirements }`, matching
  `@x402/core`'s `VerifyRequest`/`SettleRequest` types byte-for-byte.
