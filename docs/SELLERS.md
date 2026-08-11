# Listing a Stellar service on the Bazaar

Automatic cataloging is spec `docs/SPEC.md` §5, Phase 4. A resource server
gets listed in Periplo's Bazaar the moment a buyer completes a payment
carrying the `bazaar` discovery extension. **There is no separate
registration step, no dashboard, and no API key to request.** Declare the
extension on your route, point your facilitator client at Periplo, and the
first successful payment catalogs the resource.

This is not a Periplo-specific mechanism. `bazaar` is a generic x402
protocol extension shipped by the x402 project itself
(`@x402/extensions/bazaar`), and the helper below is the official one, used
exactly as documented upstream. Periplo's own contribution is the
facilitator that understands the extension: it validates it and writes the
catalog row. It is not a reimplementation of the extension mechanics. See
`apps/facilitator/src/discovery.ts` for that side.

## 1. Declare the extension on your route

```typescript
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { x402HTTPResourceServer } from "@x402/core/http";
import { ExactStellarScheme } from "@x402/stellar/exact/client"; // client-side variant
import { declareDiscoveryExtension, bazaarResourceServerExtension } from "@x402/extensions/bazaar";

const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://periplo-testnet.fly.dev", // or your own self-hosted Periplo instance
});

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("stellar:testnet", new ExactStellarScheme())
  // Registering this is what fills in the HTTP method / dynamic-route
  // pathParams automatically — see step 2.
  .registerExtension(bazaarResourceServerExtension);

const routes = {
  "GET /weather/:city": {
    accepts: {
      scheme: "exact",
      network: "stellar:testnet",
      payTo: "GYOURSTELLARADDRESS",
      price: "$0.001",
      extra: { areFeesSponsored: true }, // required for the Stellar exact scheme
    },
    extensions: {
      ...declareDiscoveryExtension({
        input: { city: "San Francisco" },
        inputSchema: {
          properties: {
            // Per-parameter descriptions are the whole point: this is what
            // Phase 5's search ranking reads, and what makes your endpoint
            // legible to an agent deciding whether to call it. An endpoint
            // with a bare `{ type: "string" }` and no description is
            // technically listed but effectively unfindable.
            city: { type: "string", description: "City name, e.g. 'San Francisco'" },
            units: {
              type: "string",
              enum: ["celsius", "fahrenheit"],
              description: "Temperature unit for the response",
            },
          },
          required: ["city"],
        },
        output: {
          example: { city: "San Francisco", weather: "foggy", temperature: 15 },
        },
      }),
    },
  },
};

const httpServer = new x402HTTPResourceServer(resourceServer, routes);
```

For an MCP tool instead of an HTTP route, swap the `declareDiscoveryExtension`
call for the `toolName` form. See the [upstream bazaar
README](https://github.com/x402-foundation/x402/blob/main/typescript/packages/extensions/src/bazaar/README.md)
for the full parameter reference: HTTP GET/POST/PUT/PATCH/DELETE, MCP
tools, dynamic `:param` routes, and `[param]` Next.js routes.

## 2. Nothing else to do

The next time a buyer pays this route, your resource server's HTTP layer
(via `bazaarResourceServerExtension`) fills in the concrete HTTP method and
any dynamic path parameters, echoes the extension into the payment, and
your facilitator client forwards it to Periplo's `/verify` and `/settle`.
Periplo validates it and writes, or updates, the catalog row in the same
request. No extra round trip is needed.

## 3. Confirm the listing landed

Periplo's `/verify` and `/settle` responses carry an `EXTENSION-RESPONSES`
header (base64-encoded JSON) reporting the outcome:

```jsonc
{ "bazaar": { "status": "success" } }
{ "bazaar": { "status": "rejected", "rejectedReason": "info failed schema validation" } }
```

`HTTPFacilitatorClient` (the official client) decodes and logs this header
automatically. Check your resource server's logs after a test payment, or
decode it yourself:

```typescript
const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
```

A `rejected` status always carries a specific `rejectedReason`, per spec
§1's rule that every rejection carries a non-null reason. The most common
causes: `inputSchema` doesn't match the shape of `input`/`example` (check
`required` fields), or a dynamic route's `routeTemplate` failed Periplo's
stricter path-traversal check. See `docs/INTEROP.md` for exactly where
this diverges from upstream's own, more permissive check.

## What Periplo does with your listing

- Catalogs your resource with the original, un-decoded `routeTemplate` as
  part of the catalog key. See `packages/bazaar/src/route-template.ts`.
- Merges each new payment's payment option into the resource's `accepts`
  array rather than duplicating the row (`packages/bazaar/src/db/catalog.ts`).
- Stores the declared JSON schema, with your parameter descriptions, in
  `resources.parameters`. This is the raw material Phase 5's search
  embeddings are built from, so richer descriptions improve discoverability
  as well as documentation quality.
- Never requires you to run your own catalog database, register an API
  key, or call a separate "publish" endpoint.
