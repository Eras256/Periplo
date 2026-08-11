/**
 * Node HTTP entrypoint — deployment path 1/2 (hosted / self-hosted, spec
 * §5 Phase 3). Everything that actually matters (verify/settle logic, the
 * boot-time non-custodial check) lives in `core.ts` and `app.ts`; this
 * file only wires environment variables to `createFacilitatorCore` and
 * binds a port via `@hono/node-server` (the official Hono Node adapter —
 * added specifically for this deployment, see docs/DEFERRED.md for why it
 * wasn't added earlier).
 */

import { serve } from "@hono/node-server";
import { createServiceRoleClient, type Database } from "@periplo/bazaar";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFacilitatorApp } from "./app.js";
import { createFacilitatorCore, type FacilitatorCoreConfig } from "./core.js";

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
 * aren't set — automatic cataloging (spec Phase 4) degrades to
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

async function main(): Promise<void> {
  const core = await createFacilitatorCore({ signers: loadSigners() });
  const app = createFacilitatorApp(core, { catalogClient: loadCatalogClient() });

  // Explicit 0.0.0.0: @hono/node-server's default hostname isn't
  // guaranteed reachable from outside the container in every environment
  // (Fly's proxy flagged this once — worked anyway in practice, but no
  // reason to rely on a default here).
  serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, (info) => {
    console.log(`Periplo facilitator listening on ${info.address}:${info.port}`);
  });
}

main().catch((error) => {
  // Includes CustodialKeyError from the boot-time non-custodial check
  // (spec §1 constraint 3) — the process must refuse to start, and this
  // is the top-level catch that actually makes it exit non-zero rather
  // than silently hang.
  console.error("Facilitator failed to start:", error);
  process.exit(1);
});
