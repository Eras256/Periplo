import { describe, expect, it } from "vitest";
import { buildDiscoveryText } from "./discovery-text.js";

describe("buildDiscoveryText", () => {
  it("includes the resource description", () => {
    const text = buildDiscoveryText({
      description: "Current weather conditions by city",
      parameters: {},
    });
    expect(text).toContain("Current weather conditions by city");
  });

  it("pulls per-parameter descriptions out of a nested HTTP-shaped schema", () => {
    const text = buildDiscoveryText({
      description: null,
      parameters: {
        input: {
          properties: {
            queryParams: {
              properties: {
                city: { type: "string", description: "City name, e.g. San Francisco" },
                units: { type: "string", description: "Temperature unit for the response" },
              },
            },
          },
        },
      },
    });
    expect(text).toContain("City name, e.g. San Francisco");
    expect(text).toContain("Temperature unit for the response");
  });

  it("pulls the MCP tool schema's per-parameter descriptions", () => {
    const text = buildDiscoveryText({
      description: "Analyze financial data for a given ticker",
      parameters: {
        input: {
          type: "object",
          properties: {
            ticker: { type: "string", description: "Stock ticker symbol" },
          },
          required: ["ticker"],
        },
      },
    });
    expect(text).toContain("Analyze financial data for a given ticker");
    expect(text).toContain("Stock ticker symbol");
  });

  it("includes bare parameter names with no description, so a query naming a field still matches", () => {
    const text = buildDiscoveryText({
      description: "Translate text",
      parameters: {
        input: {
          properties: {
            targetLanguage: { type: "string" },
          },
        },
      },
    });
    expect(text).toContain("targetLanguage");
  });

  it("deduplicates repeated description strings", () => {
    const text = buildDiscoveryText({
      description: "Same text",
      parameters: { input: { properties: { a: { description: "Same text" } } } },
    });
    expect(text.match(/Same text/g)).toHaveLength(1);
  });

  it("returns an empty string for a resource with no description or parameters", () => {
    expect(buildDiscoveryText({ description: null, parameters: {} })).toBe("");
  });

  it("doesn't throw on a malformed/unexpected parameters shape", () => {
    expect(() =>
      buildDiscoveryText({ description: "ok", parameters: { input: "not an object" } })
    ).not.toThrow();
    expect(() =>
      buildDiscoveryText({ description: "ok", parameters: { input: null } })
    ).not.toThrow();
    expect(() =>
      buildDiscoveryText({ description: "ok", parameters: { input: [1, 2, 3] } })
    ).not.toThrow();
  });
});
