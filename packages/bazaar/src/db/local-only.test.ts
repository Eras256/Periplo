import { describe, expect, it } from "vitest";
import {
  ALLOW_REMOTE_SUPABASE_TESTS_ENV,
  assertSupabaseUrlSafeForTests,
  isLocalSupabaseUrl,
  RemoteSupabaseRefusedError,
} from "./local-only.js";

describe("isLocalSupabaseUrl", () => {
  it.each([
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "http://127.0.0.5:54321",
    "http://[::1]:54321",
    "http://host.docker.internal:54321",
    "http://supabase.localhost:54321",
  ])("treats %s as local", (url) => {
    expect(isLocalSupabaseUrl(url)).toBe(true);
  });

  it.each([
    "https://abcdefghijklmnop.supabase.co",
    "https://localhost.example.com",
    "https://127.0.0.1.nip.io",
    "https://example.com/localhost",
    "not a url",
    "",
  ])("treats %s as remote", (url) => {
    expect(isLocalSupabaseUrl(url)).toBe(false);
  });
});

describe("assertSupabaseUrlSafeForTests", () => {
  it("passes for a local stack without any opt-in", () => {
    expect(() => assertSupabaseUrlSafeForTests("http://127.0.0.1:54321", {})).not.toThrow();
  });

  it("refuses a remote project by default, naming the host and the way out", () => {
    const attempt = () => assertSupabaseUrlSafeForTests("https://abcdefghijklmnop.supabase.co", {});
    expect(attempt).toThrow(RemoteSupabaseRefusedError);
    expect(attempt).toThrow(/abcdefghijklmnop\.supabase\.co/);
    expect(attempt).toThrow(/supabase start/);
    expect(attempt).toThrow(new RegExp(ALLOW_REMOTE_SUPABASE_TESTS_ENV));
  });

  it("refuses an unparseable URL instead of letting it through", () => {
    expect(() => assertSupabaseUrlSafeForTests("not a url", {})).toThrow(
      RemoteSupabaseRefusedError
    );
  });

  it("allows a remote project only with the explicit opt-in set to exactly 1", () => {
    const remote = "https://abcdefghijklmnop.supabase.co";
    expect(() =>
      assertSupabaseUrlSafeForTests(remote, { [ALLOW_REMOTE_SUPABASE_TESTS_ENV]: "1" })
    ).not.toThrow();
    for (const notOptIn of ["0", "true", "yes", ""]) {
      expect(() =>
        assertSupabaseUrlSafeForTests(remote, { [ALLOW_REMOTE_SUPABASE_TESTS_ENV]: notOptIn })
      ).toThrow(RemoteSupabaseRefusedError);
    }
  });
});
