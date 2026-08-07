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

async function main(): Promise<void> {
  const core = await createFacilitatorCore({ signers: loadSigners() });
  const app = createFacilitatorApp(core);

  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`Periplo facilitator listening on :${info.port}`);
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
