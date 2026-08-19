/**
 * A single real, payment-gated demo resource: self-facilitation (spec §5
 * Phase 3's "deployment path 3"), a resource server sharing this same
 * process and the same `FacilitatorCore` as the hosted facilitator itself,
 * no separate HTTP hop, no separately-operated seller.
 *
 * Exists to close the third item from real external QA's 2026-08-19 catalog
 * report (see CLAUDE.md's Architecture section): the catalog had zero
 * externally-reachable resources to search, so ranking quality was
 * genuinely unjudgeable from outside. This gives it exactly one, cataloged
 * through the same real-payment path every other catalog write goes
 * through, not inserted directly.
 *
 * Built on `@x402/hono`'s `paymentMiddleware` + `@x402/core/server`'s
 * `x402ResourceServer` (spec §1's "do not reimplement verify/settle",
 * extended here the same way it already is for the bazaar extension: this
 * module never hand-builds a 402 response, decodes an `X-PAYMENT` header,
 * or encodes a settlement response itself) and `@x402/stellar/exact/server`'s
 * `ExactStellarScheme` (the resource-server-side counterpart to the
 * facilitator-side scheme `core.ts` already uses, needed here to convert
 * this route's `{ amount, asset }` price into `PaymentRequirements` and to
 * mark `extra.areFeesSponsored` from the facilitator's own advertised
 * support). `bazaarResourceServerExtension` is the same "don't reimplement
 * the wire extension" package `apps/facilitator/src/discovery.ts` already
 * uses on the facilitator side of Bazaar; this is its resource-server side.
 *
 * Cataloging itself is NOT automatic just because the bazaar extension is
 * registered: that extension only handles the wire protocol (declaring
 * `extensions.bazaar` in the 402 response, validating the client's echo).
 * Writing to Periplo's own catalog is application logic
 * (`apps/facilitator/src/discovery.ts`'s `processBazaarExtension`), so this
 * module registers it as an `onAfterSettle` hook on the resource server,
 * the exact same function `app.ts`'s `/settle` route calls, just reached
 * from a different trigger (a real settlement here, an inbound `/settle`
 * request there).
 *
 * Configured, not hardcoded to always exist: mounted only when
 * `STELLAR_TEST_SELLER_PUBLIC` and `STELLAR_TEST_ASSET_ADDRESS` are both
 * set (the same real testnet fixtures `scripts/settle-demo.ts` already
 * uses), so a deployment without them serves the facilitator alone,
 * unchanged, exactly like the catalog client already degrades when
 * Supabase isn't configured.
 */

import type { Database } from "@periplo/bazaar";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type FacilitatorClient, x402ResourceServer } from "@x402/core/server";
import type { PaymentPayload, PaymentRequirements, SupportedResponse } from "@x402/core/types";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { paymentMiddleware } from "@x402/hono";
import { ExactStellarScheme as ExactStellarServerScheme } from "@x402/stellar/exact/server";
import type { Context, Hono } from "hono";
import type { FacilitatorCore } from "./core.js";
import { processBazaarExtension } from "./discovery.js";

export interface DemoResourceConfig {
  readonly payTo: string;
  readonly assetAddress: string;
  readonly network: "stellar:testnet" | "stellar:pubnet";
  /**
   * The real, externally-reachable base URL this deployment is actually
   * served from (e.g. `https://periplo-testnet.fly.dev`), used to build an
   * explicit `resource` for the route config rather than letting the SDK
   * derive one from the request.
   *
   * Load-bearing, not cosmetic: `@hono/node-server` derives a request's
   * scheme purely from `request.socket.encrypted` (confirmed by reading
   * its own source, `dist/index.mjs`), with no `X-Forwarded-Proto`
   * awareness at all. Behind Fly's TLS-terminating proxy the container
   * only ever sees a plain-HTTP socket, so the SDK's own request-derived
   * `resource.url` comes out as `http://...` -- reachable in practice
   * (Fly 301-redirects `http://` to `https://`, confirmed live), but not
   * the canonical URL, and exactly the class of "technically resolves but
   * isn't the real address" problem this whole round exists to fix.
   * `RouteConfig.resource` (checked directly in
   * `x402HTTPResourceServer.ts`: `routeConfig.resource ||
   * enrichedContext.adapter.getUrl()`) takes precedence over the SDK's own
   * adapter-derived URL when set, which is what this is for.
   */
  readonly baseUrl: string;
}

const TEMPERATURE_UNITS = ["celsius", "fahrenheit", "kelvin"] as const;
type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];

function isTemperatureUnit(value: string | undefined): value is TemperatureUnit {
  return value !== undefined && (TEMPERATURE_UNITS as readonly string[]).includes(value);
}

/** Converts through Celsius as the common intermediate, exact for all six pairs. */
function toCelsius(value: number, unit: TemperatureUnit): number {
  if (unit === "celsius") return value;
  if (unit === "fahrenheit") return ((value - 32) * 5) / 9;
  return value - 273.15; // kelvin
}

function fromCelsius(value: number, unit: TemperatureUnit): number {
  if (unit === "celsius") return value;
  if (unit === "fahrenheit") return (value * 9) / 5 + 32;
  return value + 273.15; // kelvin
}

/**
 * Real conversion, not a canned response: this is what a payer actually
 * gets back, independently checkable arithmetic, not a static example
 * echoed regardless of the query.
 */
function convertTemperature(
  value: number,
  from: TemperatureUnit,
  to: TemperatureUnit
): { value: number; from: TemperatureUnit; to: TemperatureUnit; result: number } {
  const celsius = toCelsius(value, from);
  const result = Math.round(fromCelsius(celsius, to) * 1000) / 1000;
  return { value, from, to, result };
}

const ROUTE_PATTERN = "GET /demo/temperature-convert";
const ROUTE_PATH = "/demo/temperature-convert";

/**
 * Mounts the demo resource onto `app` and returns nothing: this is a
 * side-effecting setup function (registers middleware + a route), matching
 * how `@x402/hono`'s own `paymentMiddleware` is meant to be applied.
 */
export function mountDemoResource(
  app: Hono,
  core: FacilitatorCore,
  config: DemoResourceConfig,
  catalogClient: SupabaseClient<Database> | null
): void {
  // `core`'s own `getSupported()` returns `SupportedResponse` directly
  // (its type is `ReturnType<x402Facilitator["getSupported"]>`, which is
  // synchronous), not the `Promise<SupportedResponse>` `FacilitatorClient`
  // requires -- this thin adapter is a type-shape fix only, still the same
  // in-process `core.verify`/`core.settle` calls underneath, no HTTP hop to
  // this same process's own /verify or /settle (the actual
  // self-facilitation wiring).
  const facilitatorClient: FacilitatorClient = {
    verify: (payload, requirements) => core.verify(payload, requirements),
    settle: (payload, requirements) => core.settle(payload, requirements),
    // x402Facilitator's own return type declares `network` as plain
    // `string`, looser than FacilitatorClient's `Network` CAIP-2 template
    // type, though the runtime value is always a real CAIP-2 string (it
    // comes straight from this same facilitator's own registered
    // networks, see core.ts). A type-only gap in the upstream package, not
    // a real risk here; narrow cast, not a broad `any`.
    getSupported: async () => core.getSupported() as unknown as SupportedResponse,
  };
  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    config.network,
    new ExactStellarServerScheme()
  );
  resourceServer.registerExtension(bazaarResourceServerExtension);

  resourceServer.onAfterSettle(async (ctx) => {
    if (!ctx.result.success || !catalogClient) {
      return;
    }
    // DeepReadonly on the hook context, not on processBazaarExtension's own
    // parameter types: same PaymentPayload/PaymentRequirements shape either
    // way, this is a type-level cast, not a behavioral one.
    await processBazaarExtension(
      ctx.paymentPayload as unknown as PaymentPayload,
      ctx.requirements as unknown as PaymentRequirements,
      catalogClient
    );
  });

  const routes = {
    [ROUTE_PATTERN]: {
      accepts: {
        scheme: "exact",
        payTo: config.payTo,
        network: config.network,
        price: { amount: "1000", asset: config.assetAddress },
        maxTimeoutSeconds: 300,
      },
      resource: `${config.baseUrl}${ROUTE_PATH}`,
      description:
        "Converts a temperature value between Celsius, Fahrenheit, and Kelvin. Real " +
        "arithmetic, not a canned response: the result reflects the actual value/from/to " +
        "query parameters on every call.",
      extensions: {
        ...declareDiscoveryExtension({
          input: { value: 100, from: "celsius", to: "fahrenheit" },
          inputSchema: {
            properties: {
              value: { type: "number", description: "The numeric temperature value to convert" },
              from: {
                type: "string",
                enum: TEMPERATURE_UNITS,
                description: "Source unit: celsius, fahrenheit, or kelvin",
              },
              to: {
                type: "string",
                enum: TEMPERATURE_UNITS,
                description: "Target unit: celsius, fahrenheit, or kelvin",
              },
            },
            required: ["value", "from", "to"],
          },
          output: {
            example: { value: 100, from: "celsius", to: "fahrenheit", result: 212 },
            schema: {
              properties: {
                value: { type: "number" },
                from: { type: "string" },
                to: { type: "string" },
                result: { type: "number", description: "The converted value" },
              },
              required: ["value", "from", "to", "result"],
            },
          },
        }),
      },
    },
  };

  app.use(paymentMiddleware(routes, resourceServer));

  app.get(ROUTE_PATH, (c: Context) => {
    const value = Number(c.req.query("value"));
    const from = c.req.query("from");
    const to = c.req.query("to");

    if (!Number.isFinite(value) || !isTemperatureUnit(from) || !isTemperatureUnit(to)) {
      c.status(400);
      return c.json({
        error: "value (number), from, and to (celsius|fahrenheit|kelvin) are required",
      });
    }

    return c.json(convertTemperature(value, from, to));
  });
}
