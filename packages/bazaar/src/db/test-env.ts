/**
 * Loads Supabase credentials for integration tests, from a local `.env`
 * (via Node's built-in `process.loadEnvFile` — no `dotenv` dependency
 * needed) when running locally, or from the environment directly in CI
 * (where secrets are injected as real env vars, not a file). Returns
 * `null` when credentials aren't available so callers can skip rather
 * than fail — a fork or an environment without repo secrets should still
 * pass `pnpm test`, just without this integration coverage.
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

export interface SupabaseTestEnv {
  readonly url: string;
  readonly anonKey: string;
  readonly serviceRoleKey: string;
}

export function loadSupabaseTestEnv(): SupabaseTestEnv | null {
  tryLoadDotEnvOnce();

  const url = process.env["SUPABASE_URL"];
  const anonKey = process.env["SUPABASE_ANON_KEY"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!url || !anonKey || !serviceRoleKey) {
    return null;
  }
  return { url, anonKey, serviceRoleKey };
}
