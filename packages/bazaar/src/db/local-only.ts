/**
 * Guard for harnesses that insert and delete rows in `resources` (the
 * integration suites and `pnpm eval`): they must not run against a remote
 * Supabase project by accident. Against the live project they race the real
 * catalog, which is how a Phase 2 test row and 55 eval fixtures once showed
 * up in production. Loopback hosts pass; anything else is refused unless
 * `PERIPLO_ALLOW_REMOTE_SUPABASE_TESTS=1` is set on purpose.
 */

export const ALLOW_REMOTE_SUPABASE_TESTS_ENV = "PERIPLO_ALLOW_REMOTE_SUPABASE_TESTS";

export class RemoteSupabaseRefusedError extends Error {
  override readonly name = "RemoteSupabaseRefusedError";
}

const LOOPBACK_IPV4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True for `localhost`, `*.localhost`, `127.x.x.x`, `[::1]` and
 * `host.docker.internal`. A lookalike such as `localhost.example.com` is not local. */
export function isLocalSupabaseUrl(url: string): boolean {
  const host = hostnameOf(url);
  if (host === null) {
    return false;
  }
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    LOOPBACK_IPV4.test(host) ||
    host === "[::1]" ||
    host === "host.docker.internal"
  );
}

export function assertSupabaseUrlSafeForTests(
  url: string,
  env: Readonly<Record<string, string | undefined>> = process.env
): void {
  if (isLocalSupabaseUrl(url) || env[ALLOW_REMOTE_SUPABASE_TESTS_ENV] === "1") {
    return;
  }
  const host = hostnameOf(url) ?? "(unparseable SUPABASE_URL)";
  throw new RemoteSupabaseRefusedError(
    `Refusing to run against SUPABASE_URL host "${host}". This suite inserts and deletes ` +
      `rows in the resources table, so against a real project it would race the live catalog. ` +
      `Start a local stack with \`supabase start\` and point SUPABASE_URL, SUPABASE_ANON_KEY ` +
      `and SUPABASE_SERVICE_ROLE_KEY at it, or set ${ALLOW_REMOTE_SUPABASE_TESTS_ENV}=1 to run ` +
      `against a remote project on purpose.`
  );
}
