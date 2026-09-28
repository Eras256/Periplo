## Introduction

`periplo` is a TypeScript client library for x402 payments on Stellar. It is built around `upto`: instead of paying a fixed price, a buyer signs a spending *ceiling* once, and a facilitator later settles only the amount actually used. The ceiling never moves; only the real usage does.

```
signed ceiling:  [████████████████████████████████] 0.10 USDC
actually used:   [████████░░░░░░░░░░░░░░░░░░░░░░░░] 0.05 USDC settled, 0.05 USDC refunded
```

That is the real shape of the first `upto` settlement on `stellar:testnet`: a buyer signed a ceiling of 0.10 USDC, the seller measured 0.05 USDC of real usage, and the `UptoSettlement` contract settled 0.05 USDC to the seller and refunded the other 0.05 USDC to the buyer in the same transaction. You can check it yourself on [Stellar Expert](https://stellar.expert/explorer/testnet/tx/d554adfb8f41efca8a5c14d7c82ded1330d3819bddd610ead51ab78257c5cafb), or watch it happen live on the [demo page](/en/demo).

### What `periplo` gives you

- **Buyer side**: sign an `upto` ceiling (`createUptoStellarPayer`) or pay a fixed `exact` price (`createExactStellarPayer`), then fetch a paid resource with retry built in (`payAndFetch`, `discoverPayAndFetch`).
- **Seller side**: declare a paid resource's discovery metadata (`definePaidResource`), advertise an `upto` ceiling (`buildUptoRequirements`), and settle real usage once it is known (`settleUptoUsage`).

Neither side reimplements payment verification or settlement: every call goes through `HTTPFacilitatorClient`, the same published client from `@x402/core` that any x402 facilitator understands.

### What works today, honestly

- `exact` is live on the public facilitator at `periplo-testnet.fly.dev` (`stellar:testnet`), used throughout the [full demo](/en/demo) and [conformance evidence](https://github.com/Eras256/Periplo/blob/main/conformance/RESULTS.md).
- `upto` settles against a deployed `UptoSettlement` Soroban contract, but requires a facilitator configured with that contract's address. The public facilitator's own `GET /supported` does not advertise `upto` today, only `exact`; check it yourself before assuming otherwise. Running your own facilitator (self-facilitation) or pointing at one that supports `upto` is required to settle it end to end.
- Everything here is `stellar:testnet` only. Periplo does not operate on mainnet yet, and `createUptoStellarPayer` throws `UptoMainnetNotSupportedError` for any other network, including `stellar:pubnet`.

### Requirements

Node.js 22 or newer (the package's `engines.node` field). No other runtime dependency beyond what npm installs.
