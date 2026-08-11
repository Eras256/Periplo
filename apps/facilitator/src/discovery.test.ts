import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { describe, expect, it } from "vitest";
import { processBazaarExtension } from "./discovery.js";

/**
 * Unit tests against `processBazaarExtension` with `catalogClient: null` —
 * validation/rejection logic only, no Supabase. The real write path
 * (catalog row appears / doesn't) is covered by
 * `discovery.integration.test.ts` (spec Phase 4 gate), matching the
 * `packages/bazaar/src/db/resources.integration.test.ts` pattern.
 */

const baseRequirements: PaymentRequirements = {
  scheme: "exact",
  network: "stellar:testnet",
  asset: "CASSET",
  amount: "1000",
  payTo: "GPAYTO",
  maxTimeoutSeconds: 60,
  extra: { areFeesSponsored: true },
};

function basePayload(extensions?: Record<string, unknown>): PaymentPayload {
  return {
    x402Version: 2,
    resource: { url: "https://seller.example/weather" },
    accepted: baseRequirements,
    payload: {},
    ...(extensions ? { extensions } : {}),
  };
}

describe("processBazaarExtension", () => {
  it("returns null when the payload declares no bazaar extension", async () => {
    const result = await processBazaarExtension(basePayload(), baseRequirements, null);
    expect(result).toBeNull();
  });

  it("returns null when extensions is present but has no bazaar key", async () => {
    const result = await processBazaarExtension(
      basePayload({ other: { foo: "bar" } }),
      baseRequirements,
      null
    );
    expect(result).toBeNull();
  });

  it("validates a well-formed HTTP GET extension as success", async () => {
    const extension = declareDiscoveryExtension({
      input: { city: "San Francisco" },
      inputSchema: {
        properties: {
          city: { type: "string", description: "City name" },
        },
        required: ["city"],
      },
      output: { example: { weather: "foggy" } },
    });
    // Simulate `bazaarResourceServerExtension.enrichDeclaration` having
    // already filled in the HTTP method, as it would before this extension
    // reaches a client and gets echoed back into the payment payload.
    const bazaarExt = extension["bazaar"] as unknown as Record<string, unknown>;
    const info = bazaarExt["info"] as Record<string, unknown>;
    const input = info["input"] as Record<string, unknown>;
    input["method"] = "GET";
    const schema = bazaarExt["schema"] as Record<string, unknown>;
    const schemaProps = schema["properties"] as Record<string, unknown>;
    const inputSchema = schemaProps["input"] as Record<string, unknown>;
    inputSchema["properties"] = {
      ...(inputSchema["properties"] as Record<string, unknown>),
      method: { type: "string", enum: ["GET"] },
    };

    const result = await processBazaarExtension(basePayload(extension), baseRequirements, null);
    expect(result).toEqual({ status: "success" });
  });

  it("validates a well-formed MCP tool extension as success", async () => {
    const extension = declareDiscoveryExtension({
      toolName: "financial_analysis",
      description: "Analyze financial data for a given ticker",
      inputSchema: {
        type: "object",
        properties: { ticker: { type: "string", description: "Stock ticker symbol" } },
        required: ["ticker"],
      },
      example: { ticker: "AAPL" },
      output: { example: { recommendation: "hold" } },
    });

    const result = await processBazaarExtension(basePayload(extension), baseRequirements, null);
    expect(result).toEqual({ status: "success" });
  });

  it("rejects a non-object bazaar extension value", async () => {
    const result = await processBazaarExtension(
      basePayload({ bazaar: "not-an-object" }),
      baseRequirements,
      null
    );
    expect(result?.status).toBe("rejected");
    expect(result?.rejectedReason).toBeTruthy();
  });

  it("rejects an extension missing info/input entirely", async () => {
    const result = await processBazaarExtension(
      basePayload({ bazaar: { schema: {} } }),
      baseRequirements,
      null
    );
    expect(result?.status).toBe("rejected");
    expect(result?.rejectedReason).toMatch(/info/i);
  });

  it.each([
    "/../../etc/passwd",
    "/%2e%2e/%2e%2e/secret",
    "//evil.example/x",
    "https://evil.example/x",
  ])("rejects a hostile routeTemplate (%s) with no catalog row", async (hostileTemplate) => {
    const extension = declareDiscoveryExtension({
      input: { id: "1" },
      inputSchema: { properties: { id: { type: "string" } }, required: ["id"] },
    });
    const bazaarExt = extension["bazaar"] as unknown as Record<string, unknown>;
    const info = bazaarExt["info"] as Record<string, unknown>;
    (info["input"] as Record<string, unknown>)["method"] = "GET";
    bazaarExt["routeTemplate"] = hostileTemplate;

    const result = await processBazaarExtension(basePayload(extension), baseRequirements, null);
    expect(result?.status).toBe("rejected");
    expect(result?.rejectedReason).toBeTruthy();
  });

  it("accepts a well-formed dynamic routeTemplate", async () => {
    const extension = declareDiscoveryExtension({
      input: { id: "1" },
      inputSchema: { properties: { id: { type: "string" } }, required: ["id"] },
    });
    const bazaarExt = extension["bazaar"] as unknown as Record<string, unknown>;
    const info = bazaarExt["info"] as Record<string, unknown>;
    (info["input"] as Record<string, unknown>)["method"] = "GET";
    bazaarExt["routeTemplate"] = "/users/:userId";

    const result = await processBazaarExtension(basePayload(extension), baseRequirements, null);
    expect(result).toEqual({ status: "success" });
  });
});
