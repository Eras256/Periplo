/**
 * Same pattern as `packages/bazaar/src/db/test-env.ts`: load `.env` via
 * Node's built-in `process.loadEnvFile()` (no `dotenv` dependency), return
 * `null` when the real testnet key isn't configured so integration tests
 * skip cleanly instead of failing on a fork or a secrets-less environment.
 */

let attemptedEnvFileLoad = false;

function tryLoadDotEnvOnce(): void {
  if (attemptedEnvFileLoad) {
    return;
  }
  attemptedEnvFileLoad = true;
  try {
    process.loadEnvFile();
  } catch {
    // No .env file (e.g. CI) — env vars are expected to be set directly.
  }
}

export interface StellarTestEnv {
  readonly feeSponsorSecret: string;
  readonly feeSponsorPublic: string;
}

export function loadStellarTestEnv(): StellarTestEnv | null {
  tryLoadDotEnvOnce();

  const feeSponsorSecret = process.env.STELLAR_FEE_SPONSOR_SECRET;
  const feeSponsorPublic = process.env.STELLAR_FEE_SPONSOR_PUBLIC;

  if (!feeSponsorSecret || !feeSponsorPublic) {
    return null;
  }
  return { feeSponsorSecret, feeSponsorPublic };
}
