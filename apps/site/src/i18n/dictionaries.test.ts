import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { format } from "./dictionaries";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function shape(value: Json, path = ""): string[] {
  if (Array.isArray(value))
    return [`${path}[${value.length}]`, ...value.flatMap((v, i) => shape(v, `${path}[${i}]`))];
  if (value !== null && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .flatMap((key) => shape(value[key] as Json, path ? `${path}.${key}` : key));
  }
  return [path];
}

function placeholders(value: Json, path = ""): string[] {
  if (typeof value === "string")
    return [...value.matchAll(/\{(\w+)\}/g)].map((m) => `${path}:${m[1]}`);
  if (Array.isArray(value)) return value.flatMap((v, i) => placeholders(v, `${path}[${i}]`));
  if (value !== null && typeof value === "object") {
    return Object.keys(value).flatMap((key) => placeholders(value[key] as Json, `${path}.${key}`));
  }
  return [];
}

function strings(value: Json): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("dictionaries", () => {
  it("en and es have exactly the same keys and array lengths", () => {
    expect(shape(es as Json)).toEqual(shape(en as Json));
  });

  it("use the same placeholders in both languages", () => {
    expect(placeholders(es as Json).sort()).toEqual(placeholders(en as Json).sort());
  });

  it("contain no empty strings and no em dashes", () => {
    for (const text of [...strings(en as Json), ...strings(es as Json)]) {
      expect(text.trim()).not.toBe("");
      expect(text).not.toContain(String.fromCharCode(0x2014));
    }
  });

  it("never claim production or a live mainnet", () => {
    for (const text of [...strings(en as Json), ...strings(es as Json)]) {
      expect(text.toLowerCase()).not.toMatch(/\b(production|producción)\b/);
      const mainnet = text.toLowerCase().includes("mainnet");
      if (mainnet)
        expect(text.toLowerCase()).toMatch(
          /not operate on mainnet yet|no opera en mainnet todavía/
        );
    }
  });
});

describe("format", () => {
  it("fills known placeholders and leaves unknown ones visible", () => {
    expect(format("{a} of {b}", { a: 1, b: "two" })).toBe("1 of two");
    expect(format("{a} and {missing}", { a: "x" })).toBe("x and {missing}");
  });
});
