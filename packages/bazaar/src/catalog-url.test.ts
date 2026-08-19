import { describe, expect, it } from "vitest";
import { checkCatalogUrl } from "./catalog-url.js";

describe("checkCatalogUrl: valid inputs", () => {
  it("accepts an absolute https URL", () => {
    expect(checkCatalogUrl("https://example.com/weather")).toEqual({
      valid: true,
      reason: null,
    });
  });

  it("accepts an absolute http URL", () => {
    expect(checkCatalogUrl("http://example.com/weather").valid).toBe(true);
  });

  it("accepts a URL with a port on a non-local host", () => {
    expect(checkCatalogUrl("https://example.com:8443/weather").valid).toBe(true);
  });

  it("accepts a well-formed mcp:// tool URL", () => {
    expect(checkCatalogUrl("mcp://tool/financial_analysis").valid).toBe(true);
  });

  it("accepts an mcp:// tool URL with a UUID-suffixed name", () => {
    expect(
      checkCatalogUrl("mcp://tool/financial_analysis_da8703fa-2ee7-4922-aed5-b8cee63b908c").valid
    ).toBe(true);
  });
});

describe("checkCatalogUrl: the opaque-origin bug (null/*)", () => {
  it("rejects the literal string 'null'", () => {
    const result = checkCatalogUrl("null");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/opaque-origin/i);
  });

  it("rejects the real bad entry found by external QA (null/financial_analysis_...)", () => {
    const result = checkCatalogUrl("null/financial_analysis_da8703fa-2ee7-4922-aed5-b8cee63b908c");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/opaque-origin/i);
  });

  it("rejects any null/* prefix, not just the one known bad tool name", () => {
    expect(checkCatalogUrl("null/anything-else").valid).toBe(false);
  });
});

describe("checkCatalogUrl: scheme rejection", () => {
  it("rejects ftp", () => {
    const result = checkCatalogUrl("ftp://example.com/x");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/scheme/i);
  });

  it("rejects javascript:", () => {
    expect(checkCatalogUrl("javascript:alert(1)").valid).toBe(false);
  });

  it("rejects file:", () => {
    expect(checkCatalogUrl("file:///etc/passwd").valid).toBe(false);
  });

  it("rejects a malformed mcp:// url missing the tool name", () => {
    const result = checkCatalogUrl("mcp://tool/");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/mcp:\/\/tool/);
  });

  it("rejects an mcp url that doesn't follow the tool/{name} shape", () => {
    expect(checkCatalogUrl("mcp://weather").valid).toBe(false);
  });
});

describe("checkCatalogUrl: local hosts", () => {
  it("rejects the real bad entry found by external QA (http://localhost:4022/...)", () => {
    const result = checkCatalogUrl("http://localhost:4022/exact/stellar");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/local host/i);
  });

  it("rejects localhost over https too", () => {
    expect(checkCatalogUrl("https://localhost/x").valid).toBe(false);
  });

  it("rejects 127.0.0.1", () => {
    const result = checkCatalogUrl("http://127.0.0.1:3000/x");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/local host/i);
  });

  it("rejects a *.local hostname", () => {
    const result = checkCatalogUrl("http://my-service.local/x");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/local host/i);
  });

  it("is case-insensitive about localhost", () => {
    expect(checkCatalogUrl("http://LOCALHOST/x").valid).toBe(false);
  });

  it("does not false-positive on a host merely containing 'local' as a substring", () => {
    expect(checkCatalogUrl("https://localbrew.example.com/x").valid).toBe(true);
  });
});

describe("checkCatalogUrl: type / shape rejection", () => {
  it("rejects a non-string (number)", () => {
    expect(checkCatalogUrl(42).valid).toBe(false);
  });

  it("rejects null", () => {
    expect(checkCatalogUrl(null).valid).toBe(false);
  });

  it("rejects undefined", () => {
    expect(checkCatalogUrl(undefined).valid).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = checkCatalogUrl("");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/empty/i);
  });

  it("rejects a bare relative path with no scheme at all", () => {
    expect(checkCatalogUrl("/weather/san-francisco").valid).toBe(false);
  });
});

describe("checkCatalogUrl: every rejection carries a non-null reason (spec §1)", () => {
  it.each([
    42,
    null,
    undefined,
    "",
    "null",
    "null/financial_analysis_x",
    "ftp://example.com/x",
    "http://localhost:4022/exact/stellar",
    "http://127.0.0.1/x",
    "http://my-service.local/x",
    "mcp://tool/",
  ])("reason is a non-empty string for rejected input %j", (input) => {
    const result = checkCatalogUrl(input);
    expect(result.valid).toBe(false);
    expect(typeof result.reason).toBe("string");
    expect(result.reason?.length).toBeGreaterThan(0);
  });
});
