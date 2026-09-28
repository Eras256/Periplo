import { defineConfig } from "vitest/config";

// Needed for `npm test` (and `prepublishOnly`) to work standalone: run
// from this directory, vitest's `root` defaults to `process.cwd()` (here),
// not to wherever a discovered config file lives, so the repo-root
// vitest.config.ts's repo-relative include globs never match anything and
// vitest exits 1 with "No test files found."
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
