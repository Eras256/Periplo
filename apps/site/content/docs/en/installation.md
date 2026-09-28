## Installation

```
npm i periplo
```

Verified from a clean folder outside this repository: `npm install periplo`, then `npm install --save-dev typescript @types/node`, resolves and installs with no errors, and `npx tsc` type-checks a file importing from `periplo` with no errors, given `"types": ["node"]` in `compilerOptions` (the package's own types reference `Buffer`, through `@x402/core`).

### Requirements

- **Node.js 22 or newer.** Declared in the package's own `engines.node` field; npm warns on an older Node.
- **`@types/node`**, as a dev dependency, if you use TypeScript. Without it, `tsc` fails with `Cannot find name 'Buffer'` inside `@x402/core`'s own type declarations, which `periplo` re-exports through.
- **Network**: everything in this package that talks to Stellar targets `stellar:testnet`. There is no mainnet support; see [Introduction](/en/docs#what-works-today-honestly).

### Verifying the install

This checks that the package's error types actually work, without needing any network access or credentials:

```ts
import { createUptoStellarPayer, UptoMainnetNotSupportedError } from "periplo";

try {
  createUptoStellarPayer("S" + "A".repeat(55), "stellar:pubnet", {
    facilitatorBaseUrl: "https://periplo-testnet.fly.dev",
    maxSpendPerAuthorization: 1_000_000n,
  });
} catch (error) {
  console.log(error instanceof UptoMainnetNotSupportedError, (error as Error).message);
}
```

Real output, from that exact script, run against the package installed from its published tarball:

```
true upto is only supported on stellar:testnet today; stellar:pubnet (including any pubnet/mainnet network) is not yet supported.
```

That confirms two things at once: the package is installed and its types resolve, and `upto` genuinely refuses any network other than `stellar:testnet`, rather than silently doing the wrong thing.
