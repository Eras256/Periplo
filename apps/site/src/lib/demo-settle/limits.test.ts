import { describe, expect, it } from "vitest";
import {
  checkLimits,
  mergeRecent,
  type RecentSettlement,
  readLimit,
  visitorTag,
  WINDOW_MS,
} from "./limits";

const NOW = Date.UTC(2026, 8, 28, 12, 0, 0);
const A = visitorTag("203.0.113.7", "p".repeat(32));
const B = visitorTag("198.51.100.9", "p".repeat(32));
const entry = (hash: string, ageMs: number, tag: string | null): RecentSettlement => ({
  hash,
  createdAt: NOW - ageMs,
  visitorTag: tag,
});

describe("visitorTag", () => {
  it("is a stable 16-byte keyed tag that does not contain the address", () => {
    expect(A).toMatch(/^[0-9a-f]{32}$/);
    expect(visitorTag("203.0.113.7", "p".repeat(32))).toBe(A);
    expect(visitorTag("203.0.113.7", "q".repeat(32))).not.toBe(A);
    expect(A).not.toContain("203");
  });
});

describe("checkLimits", () => {
  const base = { tag: A, now: NOW, globalLimit: 5, visitorLimit: 2 };

  it("allows a visitor under both caps", () => {
    expect(checkLimits({ ...base, recent: [entry("h1", 1000, A), entry("h2", 2000, B)] })).toEqual({
      ok: true,
    });
  });

  it("blocks a visitor at their own cap with a Retry-After until their oldest entry ages out", () => {
    const verdict = checkLimits({
      ...base,
      recent: [entry("h1", 3_600_000, A), entry("h2", 1000, A), entry("h3", 500, B)],
    });
    expect(verdict).toEqual({
      ok: false,
      code: "rate_limited_visitor",
      retryAfterSeconds: Math.ceil((WINDOW_MS - 3_600_000) / 1000),
    });
  });

  it("blocks everyone at the global cap, whoever they are", () => {
    const recent = [1, 2, 3, 4, 5].map((n) => entry(`h${n}`, n * 1000, B));
    const verdict = checkLimits({ ...base, recent });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.code).toBe("rate_limited_global");
      expect(verdict.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("ignores entries older than the rolling 24 h window and entries without a tag for the visitor cap", () => {
    const recent = [
      entry("old1", WINDOW_MS + 1, A),
      entry("old2", WINDOW_MS + 5, A),
      entry("legacy", 1000, null),
    ];
    expect(checkLimits({ ...base, recent })).toEqual({ ok: true });
  });
});

describe("mergeRecent", () => {
  it("adds local attempts Horizon has not ingested yet, without double counting", () => {
    const merged = mergeRecent([entry("h1", 1, A)], [entry("h1", 1, A), entry("h2", 2, A)]);
    expect(merged.map((item) => item.hash)).toEqual(["h1", "h2"]);
  });
});

describe("readLimit", () => {
  it("uses the fallback for anything that is not a small integer and clamps to the maximum", () => {
    expect(readLimit(undefined, 40, 150)).toBe(40);
    expect(readLimit("abc", 40, 150)).toBe(40);
    expect(readLimit("-3", 40, 150)).toBe(40);
    expect(readLimit("12", 40, 150)).toBe(12);
    expect(readLimit("9999", 40, 150)).toBe(150);
  });
});
