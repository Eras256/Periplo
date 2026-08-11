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

/** Same shape as `packages/bazaar/src/db/test-env.ts`'s `SupabaseTestEnv` — duplicated rather
 * than imported so this test-only helper doesn't need to be part of `@periplo/bazaar`'s public
 * (production) API surface just to be reachable from this package's own integration tests. */
export interface SupabaseTestEnv {
  readonly url: string;
  readonly serviceRoleKey: string;
}

export function loadSupabaseTestEnv(): SupabaseTestEnv | null {
  tryLoadDotEnvOnce();

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }
  return { url, serviceRoleKey };
}
