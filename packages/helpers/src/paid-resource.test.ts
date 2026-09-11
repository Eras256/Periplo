import { describe, expect, it } from "vitest";
import { definePaidResource } from "./paid-resource.js";

const TEMPERATURE_UNITS = ["celsius", "fahrenheit", "kelvin"] as const;

function temperatureResource() {
  return definePaidResource({
    params: {
      value: { type: "number", description: "The numeric temperature value to convert" },
      from: {
        type: "string",
        enum: TEMPERATURE_UNITS,
        description: "Source unit: celsius, fahrenheit, or kelvin",
      },
      to: {
        type: "string",
        enum: TEMPERATURE_UNITS,
        description: "Target unit: celsius, fahrenheit, or kelvin",
        required: false,
      },
    },
  });
}

describe("definePaidResource", () => {
  describe("discovery declaration", () => {
    it("carries every description into the discovery schema, keyed by parameter", () => {
      const declaration = temperatureResource();
      const info = declaration.extensions.bazaar?.info as {
        input: { inputSchema?: never };
      };
      expect(info).toBeDefined();
      const schema = declaration.extensions.bazaar as unknown as {
        schema: {
          properties: {
            input: { properties: { queryParams: { properties: Record<string, unknown> } } };
          };
        };
      };
      const properties = schema.schema.properties.input.properties.queryParams.properties;
      expect(properties.value).toMatchObject({
        type: "number",
        description: "The numeric temperature value to convert",
      });
      expect(properties.from).toMatchObject({
        type: "string",
        description: "Source unit: celsius, fahrenheit, or kelvin",
        enum: TEMPERATURE_UNITS,
      });
    });

    it("marks a parameter required unless explicitly opted out", () => {
      const declaration = temperatureResource();
      const schema = declaration.extensions.bazaar as unknown as {
        schema: { properties: { input: { properties: { queryParams: { required?: string[] } } } } };
      };
      const required = schema.schema.properties.input.properties.queryParams.required ?? [];
      expect(required).toContain("value");
      expect(required).toContain("from");
      expect(required).not.toContain("to");
    });

    it("synthesizes a valid example when none is given, using the first enum member", () => {
      const declaration = temperatureResource();
      const info = declaration.extensions.bazaar as unknown as {
        info: { input: { queryParams: Record<string, unknown> } };
      };
      expect(info.info.input.queryParams).toMatchObject({
        value: 0,
        from: "celsius",
      });
    });

    it("uses a spec-provided example over the synthesized default", () => {
      const declaration = definePaidResource({
        params: {
          value: {
            type: "number",
            description: "amount",
            example: 100,
          },
        },
      });
      const info = declaration.extensions.bazaar as unknown as {
        info: { input: { queryParams: Record<string, unknown> } };
      };
      expect(info.info.input.queryParams.value).toBe(100);
    });

    it("throws if params is empty", () => {
      expect(() => definePaidResource({ params: {} })).toThrow(/at least one parameter/);
    });

    it("throws if a parameter has no description, per-parameter descriptions are not optional", () => {
      expect(() =>
        definePaidResource({
          // biome-ignore lint/suspicious/noExplicitAny: exercising a bad caller value
          params: { value: { type: "number", description: "" } as any },
        })
      ).toThrow(/no description/);
    });
  });

  describe("parseInput", () => {
    it("parses a fully valid query, coercing number and validating enum", () => {
      const declaration = temperatureResource();
      const result = declaration.parseInput({ value: "100", from: "celsius", to: "fahrenheit" });
      expect(result).toEqual({
        ok: true,
        value: { value: 100, from: "celsius", to: "fahrenheit" },
      });
    });

    it("omits an optional parameter that wasn't provided, without an error", () => {
      const declaration = temperatureResource();
      const result = declaration.parseInput({ value: "0", from: "kelvin" });
      expect(result).toEqual({ ok: true, value: { value: 0, from: "kelvin" } });
    });

    it("rejects a missing required parameter", () => {
      const declaration = temperatureResource();
      const result = declaration.parseInput({ from: "celsius" });
      expect(result.ok).toBe(false);
      expect((result as { errors: string[] }).errors).toEqual(['"value" is required']);
    });

    it("rejects a non-numeric value for a number parameter", () => {
      const declaration = temperatureResource();
      const result = declaration.parseInput({ value: "not-a-number", from: "celsius" });
      expect(result.ok).toBe(false);
      expect((result as { errors: string[] }).errors[0]).toMatch(/must be a number/);
    });

    it("rejects a value outside the declared enum", () => {
      const declaration = temperatureResource();
      const result = declaration.parseInput({ value: "1", from: "rankine" });
      expect(result.ok).toBe(false);
      expect((result as { errors: string[] }).errors[0]).toMatch(/must be one of/);
    });

    it("collects every error at once rather than failing on the first", () => {
      const declaration = temperatureResource();
      const result = declaration.parseInput({ value: "nope", from: "rankine" });
      expect(result.ok).toBe(false);
      expect((result as { errors: string[] }).errors).toHaveLength(2);
    });

    it("parses boolean parameters from the literal strings true/false", () => {
      const declaration = definePaidResource({
        params: { verbose: { type: "boolean", description: "Include extra detail" } },
      });
      expect(declaration.parseInput({ verbose: "true" })).toEqual({
        ok: true,
        value: { verbose: true },
      });
      expect(declaration.parseInput({ verbose: "false" })).toEqual({
        ok: true,
        value: { verbose: false },
      });
      const rejected = declaration.parseInput({ verbose: "yes" });
      expect(rejected.ok).toBe(false);
    });
  });
});
