import { randomUUID } from "node:crypto";
import { createServiceRoleClient, type Database } from "@periplo/bazaar";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { afterEach, describe, expect, it } from "vitest";
import { processBazaarExtension } from "./discovery.js";
import { loadSupabaseTestEnv } from "./test-env.js";

/**
 * Real integration test against the live Supabase project (spec §5 Phase 4
 * gate: "a payment carrying the extension results in a catalog row and a
 * success header; a crafted hostile routeTemplate results in a rejected
 * header with a specific reason and no row"). The "header" half of the
 * gate is app.test.ts's job (fake core, no DB needed); this file is the
 * "row" half, which needs the real table. Skipped, not failed, without
 * Supabase credentials, same pattern as
 * `packages/bazaar/src/db/resources.integration.test.ts`.
 */

const env = loadSupabaseTestEnv();

const TEST_URL_PREFIX = "https://periplo-phase4-test.example";

const baseRequirements: PaymentRequirements = {
  scheme: "exact",
  network: "stellar:testnet",
  asset: "CTESTASSET",
  amount: "1000",
  payTo: "GPHASE4TEST",
  maxTimeoutSeconds: 60,
  extra: { areFeesSponsored: true },
};

function httpExtension(): Record<string, unknown> {
  const extension = declareDiscoveryExtension({
    input: { city: "San Francisco" },
    inputSchema: {
      properties: { city: { type: "string", description: "City name" } },
      required: ["city"],
    },
    output: { example: { weather: "foggy" } },
  });
  const bazaarExt = extension["bazaar"] as unknown as Record<string, unknown>;
  (bazaarExt["info"] as Record<string, unknown> as { input: Record<string, unknown> }).input[
    "method"
  ] = "GET";
  return extension as unknown as Record<string, unknown>;
}

function mcpExtension(toolName: string): Record<string, unknown> {
  return declareDiscoveryExtension({
    toolName,
    description: "Analyze financial data for a given ticker",
    inputSchema: {
      type: "object",
      properties: { ticker: { type: "string", description: "Stock ticker symbol" } },
      required: ["ticker"],
    },
    example: { ticker: "AAPL" },
    output: { example: { recommendation: "hold" } },
  }) as unknown as Record<string, unknown>;
}

describe.skipIf(!env)("automatic cataloging: real Supabase (spec §5 Phase 4 gate)", () => {
  const { url, serviceRoleKey } = env as NonNullable<typeof env>;
  const service: SupabaseClient<Database> = createServiceRoleClient(url, serviceRoleKey);

  const createdUrls: string[] = [];

  afterEach(async () => {
    while (createdUrls.length > 0) {
      const rowUrl = createdUrls.pop();
      if (rowUrl) {
        await service.from("resources").delete().eq("url", rowUrl);
      }
    }
  });

  it("a payment carrying a valid HTTP extension produces a catalog row and a success result", async () => {
    const resourceUrl = `${TEST_URL_PREFIX}/weather-${randomUUID()}`;
    const payload: PaymentPayload = {
      x402Version: 2,
      resource: { url: resourceUrl },
      accepted: baseRequirements,
      payload: {},
      extensions: httpExtension(),
    };

    const result = await processBazaarExtension(payload, baseRequirements, service);
    createdUrls.push(resourceUrl);

    expect(result).toEqual({ status: "success" });

    const { data, error } = await service
      .from("resources")
      .select("url, type, network, pay_to, asset, amount, description, parameters, extensions")
      .eq("url", resourceUrl)
      .is("route_template", null)
      .is("tool_name", null)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.url).toBe(resourceUrl);
    expect(data?.type).toBe("http");
    expect(data?.network).toBe("stellar:testnet");
    expect(data?.pay_to).toBe("GPHASE4TEST");
    expect(data?.extensions).toContain("bazaar");
  });

  it("a payment carrying a valid MCP tool extension is cataloged with type mcp and tool_name set", async () => {
    const toolName = `financial_analysis_${randomUUID()}`;
    const resourceUrl = `mcp://tool/${toolName}`;
    const payload: PaymentPayload = {
      x402Version: 2,
      resource: { url: resourceUrl },
      accepted: baseRequirements,
      payload: {},
      extensions: mcpExtension(toolName),
    };

    const result = await processBazaarExtension(payload, baseRequirements, service);
    createdUrls.push(resourceUrl);

    expect(result).toEqual({ status: "success" });

    const { data, error } = await service
      .from("resources")
      .select("url, type, tool_name, route_template")
      .eq("tool_name", toolName)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.type).toBe("mcp");
    expect(data?.tool_name).toBe(toolName);
    expect(data?.route_template).toBeNull();
    expect(data?.url).toBe(resourceUrl);
  });

  it("a dynamic HTTP route with a valid routeTemplate is cataloged under the parameterized URL", async () => {
    const origin = `${TEST_URL_PREFIX}-${randomUUID()}`;
    const routeTemplate = "/users/:userId";
    const canonicalUrl = `${origin}${routeTemplate}`;
    const extension = httpExtension();
    (extension["bazaar"] as Record<string, unknown>)["routeTemplate"] = routeTemplate;

    const payload: PaymentPayload = {
      x402Version: 2,
      resource: { url: `${origin}/users/abc123` },
      accepted: baseRequirements,
      payload: {},
      extensions: extension,
    };

    const result = await processBazaarExtension(payload, baseRequirements, service);
    createdUrls.push(canonicalUrl);

    expect(result).toEqual({ status: "success" });

    const { data, error } = await service
      .from("resources")
      .select("url, route_template")
      .eq("url", canonicalUrl)
      .eq("route_template", routeTemplate)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.route_template).toBe(routeTemplate);
  });

  it("a crafted hostile routeTemplate is rejected with a specific reason and produces no row", async () => {
    const origin = `${TEST_URL_PREFIX}-${randomUUID()}`;
    const extension = httpExtension();
    (extension["bazaar"] as Record<string, unknown>)["routeTemplate"] = "/../../etc/passwd";

    const payload: PaymentPayload = {
      x402Version: 2,
      resource: { url: `${origin}/x` },
      accepted: baseRequirements,
      payload: {},
      extensions: extension,
    };

    const result = await processBazaarExtension(payload, baseRequirements, service);

    expect(result?.status).toBe("rejected");
    expect(result?.rejectedReason).toBeTruthy();

    // No row under any interpretation of the URL, neither the raw origin
    // nor anything derived from the hostile template landed.
    const { data } = await service.from("resources").select("url").ilike("url", `${origin}%`);
    expect(data).toEqual([]);
  });

  it("a repeated payment for the same resource merges into accepts instead of duplicating the row", async () => {
    const resourceUrl = `${TEST_URL_PREFIX}/repeat-${randomUUID()}`;
    const payload: PaymentPayload = {
      x402Version: 2,
      resource: { url: resourceUrl },
      accepted: baseRequirements,
      payload: {},
      extensions: httpExtension(),
    };

    await processBazaarExtension(payload, baseRequirements, service);
    createdUrls.push(resourceUrl);
    const secondRequirements: PaymentRequirements = { ...baseRequirements, amount: "2000" };
    await processBazaarExtension(
      { ...payload, accepted: secondRequirements },
      secondRequirements,
      service
    );

    const { data, error } = await service
      .from("resources")
      .select("accepts")
      .eq("url", resourceUrl)
      .is("route_template", null)
      .is("tool_name", null)
      .maybeSingle();

    expect(error).toBeNull();
    const accepts = (data?.accepts ?? []) as Array<{ amount?: string }>;
    expect(accepts.length).toBe(1);
    expect(accepts[0]?.amount).toBe("2000");
  });
});

describe("automatic cataloging: gating visibility", () => {
  it("documents why this suite is skipped when Supabase credentials aren't configured", () => {
    if (!env) {
      expect(env).toBeNull();
    } else {
      expect(env.url).toBeTruthy();
    }
  });
});
