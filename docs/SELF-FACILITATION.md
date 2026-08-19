# Self-facilitation: running the facilitator inside your own resource server

Deployment path 3 of `docs/SPEC.md` §5: a seller embeds the facilitator
directly in their own process, verifies and settles its own payments, and
needs no external operator (not Periplo hosted, not a self-hosted Periplo
instance, no HTTP hop to anywhere) to accept x402 payments at all. The
RFP names this path explicitly as the one most facilitator
implementations forget to make possible; `docs/SPEC.md` §5 requires it be
"packaged... all first-class" alongside hosted and self-hosted.

This isn't a Periplo package you install. `createFacilitatorCore` (the
function this guide builds) lives in `apps/facilitator/src/core.ts`,
Periplo's own code, not published anywhere. What's genuinely reusable is
the *pattern*: `@x402/core`'s `x402Facilitator` dispatching to
`@x402/stellar`'s `ExactStellarScheme`, the same two packages every other
deployment path in this repo builds on, wired directly into your own
process instead of behind an HTTP server. Read `core.ts` and
`apps/facilitator/src/demo-resource.ts` (a real, deployed, working
example of exactly this pattern, running at
`https://periplo-testnet.fly.dev/demo/temperature-convert`) alongside
this guide; they're Apache-2.0, adapt them directly.

## 1. Build your own facilitator core

```typescript
import { x402Facilitator } from "@x402/core/facilitator";
import { createEd25519Signer } from "@x402/stellar";
// NOT the package's main entry: it re-exports the CLIENT variant of
// ExactStellarScheme under the same class name. The facilitator variant
// (verify/settle/getSigners/getExtra) lives at this subpath. Importing
// the wrong one type-errors confusingly rather than pointing at the real
// cause; this is the single gotcha every deployment path in this repo
// hits once. See apps/facilitator/src/core.ts's own comment on this.
import { ExactStellarScheme } from "@x402/stellar/exact/facilitator";

const signer = createEd25519Signer(process.env.FEE_SPONSOR_SECRET!, "stellar:testnet");

const facilitator = new x402Facilitator();
const scheme = new ExactStellarScheme([signer], { areFeesSponsored: true });
facilitator.register(["stellar:testnet"], scheme);

const core = {
  getSupported: () => facilitator.getSupported(),
  verify: (payload, requirements) => facilitator.verify(payload, requirements),
  settle: (payload, requirements) => facilitator.settle(payload, requirements),
};
```

This is the whole trust boundary. `ExactStellarScheme` already implements
the per-payment safety properties (never the transaction source, never a
signer in a client auth entry, simulation checked against the expected
transfer, not trusted blindly), spec §1's "do not reimplement
verify/settle" applies here exactly as it does to every other deployment
path.

**Boot-time non-custodial check, your own responsibility here.** Spec §1
constraint 3 ("the facilitator sponsors network fees only; it must refuse
to boot if configured with a key that can move user funds") is not
inside `@x402/stellar`, since it's an operational check on *your*
configuration, not a wire-protocol concern the SDK could enforce for
you. `apps/facilitator/src/boot-safety.ts`'s `assertNonCustodialSigner`
is a real, working, ~30-line implementation of it (loads the signer's
account, refuses to construct the core if it holds any non-native-XLM
balance): copy the pattern, don't skip the check just because nothing in
`@x402/core`/`@x402/stellar` forces you to.

## 2. Wire it into your own resource server

`x402ResourceServer` needs a `FacilitatorClient` (`verify`/`settle`/
`getSupported`, the last one returning a `Promise`). Depending on your
SDK version, `x402Facilitator.getSupported()` may already return a
`Promise` directly, or may not, matching whichever exact behavior your
installed `@x402/core` version has, check before assuming; if it
doesn't, wrap it the way `apps/facilitator/src/demo-resource.ts` does,
a one-line async adapter, not a real behavioral difference:

```typescript
import { type FacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactStellarScheme as ExactStellarServerScheme } from "@x402/stellar/exact/server";
import { paymentMiddleware } from "@x402/hono"; // or @x402/express, for Express

const facilitatorClient: FacilitatorClient = {
  verify: (payload, requirements) => core.verify(payload, requirements),
  settle: (payload, requirements) => core.settle(payload, requirements),
  getSupported: async () => core.getSupported(),
};

const resourceServer = new x402ResourceServer(facilitatorClient).register(
  "stellar:testnet",
  new ExactStellarServerScheme()
);

app.use(
  paymentMiddleware(
    {
      "GET /your-route": {
        accepts: {
          scheme: "exact",
          payTo: "GYOURSTELLARADDRESS",
          network: "stellar:testnet",
          price: { amount: "1000", asset: "CYOURASSETADDRESS" },
        },
      },
    },
    resourceServer
  )
);
```

No HTTP hop happens anywhere in this: `paymentMiddleware` calls
`resourceServer.processHTTPRequest`/`processSettlement`, which call
`facilitatorClient.verify`/`.settle` directly, which are your own
in-process functions from step 1. `@x402/hono`/`@x402/express` are the
same official framework adapters every deployment path in this repo
already treats as "don't reimplement the 402/settlement wire protocol",
extended to self-facilitation the same way it already applies to
verify/settle and to the Bazaar extension.

## 3. A real gotcha this repo hit deploying exactly this pattern

If your resource server sits behind a reverse proxy that terminates TLS
(Fly.io, most managed platforms), check what URL your framework's own
request adapter reports for the resource before trusting it anywhere
that matters. `@hono/node-server` derives a request's scheme purely from
`request.socket.encrypted`, with no `X-Forwarded-Proto` awareness at
all, confirmed by reading its source: behind a TLS-terminating proxy the
container's own socket is always plain HTTP, so an SDK-derived
`resource.url` comes out `http://...` even though the real client
connected over `https://`. `RouteConfig.resource` (an explicit URL you
set on the route config) takes precedence over the SDK's own
request-derived one, checked directly in `x402HTTPResourceServer`'s
source (`routeConfig.resource || adapter.getUrl()`); this is exactly how
`demo-resource.ts`'s `DemoResourceConfig.baseUrl` avoids it. Worth
checking regardless of what your resource's URL is used for downstream
(a Bazaar catalog entry, a receipt, a log line), not just for Bazaar
listings specifically.

## What this path does NOT give you for free

- **No automatic Bazaar listing.** Cataloging on Periplo's own Bazaar
  (`docs/SELLERS.md`) happens inside Periplo's own `/verify`/`/settle`
  HTTP handlers, specific to Periplo's deployment, not something a fully
  independent self-facilitated resource server calls into. If you want
  your self-facilitated resource discoverable through Periplo's catalog
  too, you'd need to also route through a Periplo-operated facilitator
  for that purpose, a different, additional integration, not this one.
- **No channel accounts, no burst-throughput handling.** `docs/SPEC.md`
  §2 notes the facilitator's own account sequence number is the
  bottleneck under bursty traffic; this guide's minimal example doesn't
  address that, same as `apps/facilitator/src/core.ts` doesn't yet
  either.
- **`stellar:pubnet` needs your own funded fee-sponsor key on mainnet.**
  Nothing here is Stellar-testnet-specific, but nothing here funds a
  mainnet account for you either.
