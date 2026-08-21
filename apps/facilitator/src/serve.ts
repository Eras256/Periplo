/**
 * Node HTTP entrypoint: deployment path 1/2 (hosted / self-hosted, spec
 * §5 Phase 3). Everything that actually matters (verify/settle logic, the
 * boot-time non-custodial check) lives in `core.ts` and `app.ts`; this
 * file only wires environment variables to `createFacilitatorCore` and
 * binds a port via `@hono/node-server` (the official Hono Node adapter,
 * added specifically for this deployment, see docs/DEFERRED.md for why it
 * wasn't added earlier).
 */

import { serve } from "@hono/node-server";
import { createServiceRoleClient, type Database } from "@periplo/bazaar";
import { embedDocument } from "@periplo/search";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFacilitatorApp } from "./app.js";
import { createFacilitatorCore, type FacilitatorCoreConfig } from "./core.js";
import type { DemoResourceConfig } from "./demo-resource.js";

const PORT = Number(process.env.PORT ?? 8402);

function loadSigners(): FacilitatorCoreConfig["signers"] {
  const signers: FacilitatorCoreConfig["signers"] = {};
  const testnetSecret =
    process.env.STELLAR_FEE_SPONSOR_SECRET_TESTNET ?? process.env.STELLAR_FEE_SPONSOR_SECRET;
  if (testnetSecret) {
    signers["stellar:testnet"] = testnetSecret;
  }
  const pubnetSecret = process.env.STELLAR_FEE_SPONSOR_SECRET_PUBNET;
  if (pubnetSecret) {
    signers["stellar:pubnet"] = pubnetSecret;
  }
  return signers;
}

/**
 * `null` (not a boot-time error) when `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
 * aren't set: automatic cataloging (spec Phase 4) degrades to
 * validate-without-persist rather than the whole facilitator refusing to
 * boot over an optional feature. The service-role key bypasses RLS
 * (spec §6) and must only ever come from an environment variable, never a
 * committed file.
 */
function loadCatalogClient(): SupabaseClient<Database> | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return null;
  }
  return createServiceRoleClient(url, serviceRoleKey);
}

/**
 * `null` unless both `STELLAR_TEST_SELLER_PUBLIC` and
 * `STELLAR_TEST_ASSET_ADDRESS` are set: the same real testnet fixtures
 * `scripts/settle-demo.ts` already uses, reused here rather than adding a
 * second set of secrets for the same purpose. Optional the same way the
 * catalog client is: a deployment without them serves the facilitator
 * alone, unchanged. `DEMO_RESOURCE_BASE_URL` defaults to this project's
 * one real deployment (`https://periplo-testnet.fly.dev`) rather than
 * requiring it as a third secret for the only environment that currently
 * needs it; see `demo-resource.ts`'s `DemoResourceConfig.baseUrl` doc
 * comment for why an explicit base URL matters at all (not cosmetic).
 */
function loadDemoResourceConfig(): DemoResourceConfig | null {
  const payTo = process.env.STELLAR_TEST_SELLER_PUBLIC;
  const assetAddress = process.env.STELLAR_TEST_ASSET_ADDRESS;
  if (!payTo || !assetAddress) {
    return null;
  }
  const baseUrl = process.env.DEMO_RESOURCE_BASE_URL ?? "https://periplo-testnet.fly.dev";
  return { payTo, assetAddress, network: "stellar:testnet", baseUrl };
}

/**
 * `{}` unless `UPTO_SETTLEMENT_CONTRACT_TESTNET`/`_PUBNET` are set: same
 * "advertised support and reachable support must match" principle as
 * `loadSigners()` above, and the same env var name
 * `apps/facilitator/scripts/upto-settle-demo.ts` already uses for
 * testnet, reused rather than inventing a second name for the same
 * contract address.
 */
function loadUptoSettlementContracts(): NonNullable<
  FacilitatorCoreConfig["uptoSettlementContracts"]
> {
  const contracts: NonNullable<FacilitatorCoreConfig["uptoSettlementContracts"]> = {};
  const testnetContract = process.env.UPTO_SETTLEMENT_CONTRACT_TESTNET;
  if (testnetContract) {
    contracts["stellar:testnet"] = testnetContract;
  }
  const pubnetContract = process.env.UPTO_SETTLEMENT_CONTRACT_PUBNET;
  if (pubnetContract) {
    contracts["stellar:pubnet"] = pubnetContract;
  }
  return contracts;
}

/**
 * `undefined` (library default, 50_000 stroops) unless `MAX_TRANSACTION_FEE_STROOPS`
 * is set. Found necessary live, not assumed: real testnet Soroban resource
 * fees for a plain SAC transfer are currently running ~72,000 stroops
 * (confirmed against `https://horizon-testnet.stellar.org/fee_stats`,
 * `fee_charged.p95` = 75,739 the same day), above the library's own
 * default ceiling, so `ExactStellarScheme` was rejecting real payments
 * with `invalid_exact_stellar_payload_fee_exceeds_maximum` before this
 * override existed, not specific to any one route: `/verify`/`/settle`
 * would have hit the exact same ceiling under the same network
 * conditions. Still a real, enforced safety ceiling (spec §1 constraint
 * 3's "sponsors network fees only" doesn't mean unbounded), just raised
 * to match reality instead of an inherited default nobody had reason to
 * pick for this network's current conditions.
 */
function loadMaxTransactionFeeStroops(): number | undefined {
  const raw = process.env.MAX_TRANSACTION_FEE_STROOPS;
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function main(): Promise<void> {
  const maxTransactionFeeStroops = loadMaxTransactionFeeStroops();
  const core = await createFacilitatorCore({
    signers: loadSigners(),
    uptoSettlementContracts: loadUptoSettlementContracts(),
    ...(maxTransactionFeeStroops !== undefined ? { maxTransactionFeeStroops } : {}),
  });
  const app = createFacilitatorApp(core, {
    catalogClient: loadCatalogClient(),
    demoResource: loadDemoResourceConfig(),
  });

  // Explicit 0.0.0.0: @hono/node-server's default hostname isn't
  // guaranteed reachable from outside the container in every environment
  // (Fly's proxy flagged this once, worked anyway in practice, but no
  // reason to rely on a default here).
  serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, (info) => {
    console.log(`Periplo facilitator listening on ${info.address}:${info.port}`);
  });

  // Pre-warm the local embedding model (spec Phase 5) so the *first* real
  // payment carrying a bazaar extension isn't the request that pays for
  // downloading/loading it, fire-and-forget, not awaited: a slow or
  // failed warm-up must never delay accepting connections, and
  // `embedDocument`'s lazy singleton means a real request already in
  // flight just reuses this same load instead of starting a second one.
  embedDocument("warm-up").catch((error) => {
    console.warn(
      `[search] embedding model warm-up failed (will retry on first real use): ${error instanceof Error ? error.message : String(error)}`
    );
  });
}

main().catch((error) => {
  // Includes CustodialKeyError from the boot-time non-custodial check
  // (spec §1 constraint 3): the process must refuse to start, and this
  // is the top-level catch that actually makes it exit non-zero rather
  // than silently hang.
  console.error("Facilitator failed to start:", error);
  process.exit(1);
});
