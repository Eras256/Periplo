import { describe, expect, it } from "vitest";
import { loadDemoPlayConfig } from "./serve.js";

/**
 * Real regression coverage for a real bug: `resourceUrl` shipped without
 * the `value`/`from`/`to` query parameters `/demo/temperature-convert`
 * requires, found live by a real click on the deployed page. The 402
 * challenge succeeds either way (the price doesn't depend on the
 * query), so a visitor without them got charged and then shown a 400 —
 * this session's own verification scripts never caught it because they
 * hardcoded the query string directly in their own fetch call, never
 * exercising this function's real default. Importing `serve.ts` at all
 * needs its own entrypoint guard (`import.meta.url === file://${process.argv[1]}`)
 * around `main()`, or this file would try to boot a real server against
 * whatever's in the test process's own env.
 */

const DEMO_RESOURCE_CONFIG = {
  payTo: "GDEMOPAYEE",
  assetAddress: "CDEMOASSET",
  network: "stellar:testnet" as const,
  baseUrl: "https://periplo-testnet.fly.dev",
};

describe("loadDemoPlayConfig", () => {
  it("returns null when STELLAR_TEST_BUYER_SECRET isn't set", () => {
    const original = process.env.STELLAR_TEST_BUYER_SECRET;
    delete process.env.STELLAR_TEST_BUYER_SECRET;
    try {
      expect(loadDemoPlayConfig(DEMO_RESOURCE_CONFIG)).toBeNull();
    } finally {
      if (original !== undefined) process.env.STELLAR_TEST_BUYER_SECRET = original;
    }
  });

  it("returns null when demoResourceConfig is null, even with a faucet secret configured", () => {
    const original = process.env.STELLAR_TEST_BUYER_SECRET;
    process.env.STELLAR_TEST_BUYER_SECRET = "SFAKESECRET";
    try {
      expect(loadDemoPlayConfig(null)).toBeNull();
    } finally {
      if (original !== undefined) {
        process.env.STELLAR_TEST_BUYER_SECRET = original;
      } else {
        delete process.env.STELLAR_TEST_BUYER_SECRET;
      }
    }
  });

  it("resourceUrl includes real value/from/to query parameters, not just the bare path (the actual regression)", () => {
    const original = process.env.STELLAR_TEST_BUYER_SECRET;
    process.env.STELLAR_TEST_BUYER_SECRET = "SFAKESECRET";
    try {
      const config = loadDemoPlayConfig(DEMO_RESOURCE_CONFIG);
      expect(config).not.toBeNull();
      const url = new URL(config?.resourceUrl as string);
      expect(url.origin + url.pathname).toBe(
        "https://periplo-testnet.fly.dev/demo/temperature-convert"
      );
      expect(url.searchParams.get("value")).toBeTruthy();
      expect(url.searchParams.get("from")).toBeTruthy();
      expect(url.searchParams.get("to")).toBeTruthy();
    } finally {
      if (original !== undefined) {
        process.env.STELLAR_TEST_BUYER_SECRET = original;
      } else {
        delete process.env.STELLAR_TEST_BUYER_SECRET;
      }
    }
  });
});
