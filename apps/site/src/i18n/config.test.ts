import { describe, expect, it } from "vitest";
import { negotiateLocale, switchLocalePath } from "./config";

describe("negotiateLocale", () => {
  it("matches on the primary subtag and honors q-values", () => {
    expect(negotiateLocale("es-MX,es;q=0.9,en;q=0.8")).toBe("es");
    expect(negotiateLocale("fr-FR,fr;q=0.9,es;q=0.5,en;q=0.7")).toBe("en");
    expect(negotiateLocale("en-GB")).toBe("en");
    expect(negotiateLocale("pt-BR,es;q=0.4")).toBe("es");
  });

  it("falls back to English for missing, unsupported or malformed headers", () => {
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale("")).toBe("en");
    expect(negotiateLocale("de,fr")).toBe("en");
    expect(negotiateLocale("es;q=0")).toBe("en");
    expect(negotiateLocale(";;,,")).toBe("en");
  });
});

describe("switchLocalePath", () => {
  it("swaps an existing locale segment", () => {
    expect(switchLocalePath("/es/demo", "en")).toBe("/en/demo");
    expect(switchLocalePath("/en", "es")).toBe("/es");
    expect(switchLocalePath("/en/legal/privacy", "es")).toBe("/es/legal/privacy");
  });

  it("prefixes paths without a locale", () => {
    expect(switchLocalePath("/", "es")).toBe("/es");
    expect(switchLocalePath("/demo", "en")).toBe("/en/demo");
  });
});
