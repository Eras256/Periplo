import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "eval/**/*.test.ts"],
    environment: "node",
    passWithNoTests: false,
    // Default (5000ms) isn't enough for a cold run: CI starts with no
    // fastembed model cache, and the first test touching
    // embedDocument/embedQuery pays a real download + load cost (Phase 5).
    // Every other real-service integration suite in this repo (Supabase,
    // Stellar RPC) shares this file's timeout too, so raising it globally
    // is consistent with how those are already treated, not a new
    // exception carved out for one dependency.
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["packages/*/src/**", "apps/*/src/**", "eval/**"],
      exclude: ["**/*.test.ts", "**/dist/**"],
    },
  },
});
