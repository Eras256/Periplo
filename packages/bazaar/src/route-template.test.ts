import { describe, expect, it } from "vitest";
import { checkRouteTemplate } from "./route-template.js";

/** Builds a string that needs `layers + 2` decode passes to fully resolve to "..". */
function nTimesReencoded(base: string, layers: number): string {
  let s = base;
  for (let i = 0; i < layers; i++) {
    s = s.split("%").join("%25");
  }
  return s;
}

describe("checkRouteTemplate: valid inputs", () => {
  it("accepts a plain root-relative path", () => {
    expect(checkRouteTemplate("/weather")).toEqual({ valid: true, reason: null });
  });

  it("accepts a path with a template placeholder", () => {
    expect(checkRouteTemplate("/weather/{city}").valid).toBe(true);
  });

  it("accepts a deeply nested path", () => {
    expect(checkRouteTemplate("/api/v1/weather/{city}/forecast").valid).toBe(true);
  });

  it("accepts the root path", () => {
    expect(checkRouteTemplate("/").valid).toBe(true);
  });

  it("accepts a trailing slash", () => {
    expect(checkRouteTemplate("/weather/").valid).toBe(true);
  });

  it("does not false-positive on literal dots that aren't traversal (version-like segments)", () => {
    expect(checkRouteTemplate("/files/v1.2.3/report").valid).toBe(true);
  });

  it("accepts a legitimately percent-encoded space", () => {
    expect(checkRouteTemplate("/weather/new%20york").valid).toBe(true);
  });
});

describe("checkRouteTemplate: type / shape rejection", () => {
  it("rejects a non-string (number)", () => {
    const result = checkRouteTemplate(42);
    expect(result.valid).toBe(false);
    expect(result.reason).not.toBeNull();
  });

  it("rejects null", () => {
    expect(checkRouteTemplate(null).valid).toBe(false);
  });

  it("rejects undefined", () => {
    expect(checkRouteTemplate(undefined).valid).toBe(false);
  });

  it("rejects an object", () => {
    expect(checkRouteTemplate({ path: "/weather" }).valid).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = checkRouteTemplate("");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/empty/i);
  });
});

describe("checkRouteTemplate: naive and encoded traversal", () => {
  it("rejects unencoded '..' traversal", () => {
    const result = checkRouteTemplate("/../etc/passwd");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/traversal/i);
  });

  it("rejects unencoded '..' mid-path", () => {
    expect(checkRouteTemplate("/weather/../../etc/passwd").valid).toBe(false);
  });

  it("rejects single percent-encoded traversal (%2e%2e), the naive includes('..') bypass", () => {
    const result = checkRouteTemplate("/%2e%2e/etc/passwd");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/traversal/i);
  });

  it("rejects double percent-encoded traversal (%252e%252e)", () => {
    const result = checkRouteTemplate("/%252e%252e/etc/passwd");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/traversal/i);
  });

  it("rejects triple percent-encoded traversal, still within the decode bound", () => {
    // Empirically needs 8 decode passes to stabilise, right at the bound,
    // must still resolve (not hit the depth guard).
    const s = `/${nTimesReencoded("%2e%2e", 6)}/etc/passwd`;
    const result = checkRouteTemplate(s);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/traversal/i);
  });

  it("rejects mixed-case percent-encoded traversal (%2E%2e)", () => {
    expect(checkRouteTemplate("/%2E%2e/etc/passwd").valid).toBe(false);
  });
});

describe("checkRouteTemplate: backslash traversal", () => {
  it("rejects literal backslash traversal", () => {
    const result = checkRouteTemplate("/foo/..\\..\\bar");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/traversal/i);
  });

  it("rejects percent-encoded backslash traversal (%5c%2e%2e)", () => {
    const result = checkRouteTemplate("/foo/%5c%2e%2ebar");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/traversal/i);
  });

  it("rejects a lone literal backslash used as a separator toward traversal", () => {
    expect(checkRouteTemplate("/foo\\..\\bar").valid).toBe(false);
  });
});

describe("checkRouteTemplate: malformed percent-encoding", () => {
  it("rejects a trailing bare '%'", () => {
    const result = checkRouteTemplate("/foo%");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/malformed/i);
  });

  it("rejects an incomplete hex escape (%2)", () => {
    expect(checkRouteTemplate("/foo%2").valid).toBe(false);
  });

  it("rejects invalid hex digits (%zz)", () => {
    expect(checkRouteTemplate("/foo%zz").valid).toBe(false);
  });

  it("rejects an overlong / invalid UTF-8 percent-encoded sequence (%c0%ae%c0%ae)", () => {
    // A classic historical traversal bypass (overlong UTF-8 encoding of ".").
    // decodeURIComponent throws on this, verified empirically, not assumed.
    const result = checkRouteTemplate("/%c0%ae%c0%ae/etc/passwd");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/malformed/i);
  });
});

describe("checkRouteTemplate: absolute URLs and protocol-relative paths", () => {
  it("rejects an absolute https:// URL", () => {
    const result = checkRouteTemplate("https://evil.example/x");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/root-relative/i);
  });

  it("rejects a javascript: URL", () => {
    expect(checkRouteTemplate("javascript:alert(1)").valid).toBe(false);
  });

  it("rejects a bare protocol-relative path (//evil.example)", () => {
    const result = checkRouteTemplate("//evil.example/x");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/protocol-relative/i);
  });

  it("rejects the disguised protocol-relative path /%2f%2fevil.example (spec's required case)", () => {
    // "/%2f%2fevil.example" decodes to "///evil.example", only catchable
    // because validation runs on the fully-decoded form.
    const result = checkRouteTemplate("/%2f%2fevil.example");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/protocol-relative/i);
  });

  it("rejects a double-encoded disguised protocol-relative path", () => {
    const result = checkRouteTemplate("/%252f%252fevil.example");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/protocol-relative/i);
  });
});

describe("checkRouteTemplate: null bytes and control characters", () => {
  it("rejects a percent-encoded null byte", () => {
    const result = checkRouteTemplate("/foo%00bar");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/null byte/i);
  });

  it("rejects a literal null byte", () => {
    expect(checkRouteTemplate("/foo\0bar").valid).toBe(false);
  });

  it("rejects percent-encoded CR/LF (header/log injection)", () => {
    const result = checkRouteTemplate("/foo%0d%0aSet-Cookie:evil");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/carriage-return|line-feed/i);
  });

  it("rejects a literal newline", () => {
    expect(checkRouteTemplate("/foo\nbar").valid).toBe(false);
  });
});

describe("checkRouteTemplate: percent-encoding depth bound", () => {
  it("rejects encoding nested deep enough to exceed the decode bound", () => {
    // Empirically needs 11 decode passes, past the 8-iteration bound.
    const s = `/${nTimesReencoded("%2e%2e", 9)}/etc/passwd`;
    const result = checkRouteTemplate(s);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/depth/i);
  });
});

describe("checkRouteTemplate: every rejection carries a non-null reason (spec §1)", () => {
  it.each([
    42,
    null,
    undefined,
    "",
    "/../etc/passwd",
    "/%2e%2e/etc/passwd",
    "/foo%",
    "https://evil.example",
    "//evil.example",
    "/foo%00bar",
  ])("reason is a non-empty string for rejected input %j", (input) => {
    const result = checkRouteTemplate(input);
    expect(result.valid).toBe(false);
    expect(typeof result.reason).toBe("string");
    expect(result.reason?.length).toBeGreaterThan(0);
  });
});
