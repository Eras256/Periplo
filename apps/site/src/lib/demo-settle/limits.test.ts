import { describe, expect, it } from "vitest";
import {
  checkBudget,
  checkLimits,
  mergeRecent,
  type RecentSettlement,
  readBudget,
  readLimit,
  utcDay,
  visitorTagForDay,
  visitorTags,
  WINDOW_MS,
} from "./limits";

const NOW = Date.UTC(2026, 8, 28, 12, 0, 0);
const PEPPER = "p".repeat(32);
const A = visitorTagForDay("203.0.113.7", PEPPER, utcDay(NOW));
const B = visitorTagForDay("198.51.100.9", PEPPER, utcDay(NOW));
const A_YESTERDAY = visitorTagForDay("203.0.113.7", PEPPER, utcDay(NOW - 24 * 60 * 60 * 1000));
const entry = (
  hash: string,
  ageMs: number,
  tag: string | null,
  charged = 0n
): RecentSettlement => ({
  hash,
  createdAt: NOW - ageMs,
  visitorTag: tag,
  charged,
});

describe("visitorTagForDay / visitorTags", () => {
  it("is a stable, coarse 16-bit keyed tag that does not contain the address", () => {
    expect(A).toMatch(/^[0-9a-f]{4}$/);
    expect(visitorTagForDay("203.0.113.7", PEPPER, utcDay(NOW))).toBe(A);
    expect(visitorTagForDay("203.0.113.7", "q".repeat(32), utcDay(NOW))).not.toBe(A);
    expect(A).not.toContain("203");
  });

  it("changes when the UTC day changes, for the same address and pepper", () => {
    expect(A_YESTERDAY).not.toBe(A);
  });

  it("visitorTags returns today's tag first, then yesterday's", () => {
    expect(visitorTags("203.0.113.7", PEPPER, NOW)).toEqual([A, A_YESTERDAY]);
  });
});

describe("checkLimits", () => {
  const base = { tags: [A], now: NOW, globalLimit: 5, visitorLimit: 2 };

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

  it("still counts an entry tagged with yesterday's day-tag when checked with both tags", () => {
    const recent = [entry("h1", 1000, A_YESTERDAY), entry("h2", 500, A_YESTERDAY)];
    const verdict = checkLimits({ ...base, tags: [A, A_YESTERDAY], recent });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe("rate_limited_visitor");
  });
});

describe("checkBudget", () => {
  const base = { tags: [A], now: NOW, visitorBudget: 1_000_000n, globalBudget: 3_000_000n };

  it("allows a charge that fits both budgets", () => {
    const recent = [entry("h1", 1000, A, 400_000n), entry("h2", 1000, B, 900_000n)];
    expect(checkBudget({ ...base, recent, amount: 600_000n })).toEqual({ ok: true });
  });

  it("blocks a visitor whose charged total plus this charge would pass their budget", () => {
    const recent = [entry("h1", 3_600_000, A, 700_000n), entry("h2", 1000, A, 200_000n)];
    expect(checkBudget({ ...base, recent, amount: 200_000n })).toEqual({
      ok: false,
      code: "budget_visitor",
      retryAfterSeconds: Math.ceil((WINDOW_MS - 3_600_000) / 1000),
    });
  });

  it("blocks everyone once the global budget would be passed", () => {
    const recent = [
      entry("h1", 1000, B, 1_000_000n),
      entry("h2", 2000, B, 1_000_000n),
      entry("h3", 3000, B, 900_000n),
    ];
    const verdict = checkBudget({ ...base, recent, amount: 200_000n });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe("budget_global");
  });

  it("counts an unconfirmed attempt at the amount recorded for it and ignores charges older than 24 h", () => {
    const recent = [entry("old", WINDOW_MS + 5, A, 900_000n), entry("pending", 10, A, 1_000_000n)];
    expect(checkBudget({ ...base, recent, amount: 1n }).ok).toBe(false);
    expect(
      checkBudget({ ...base, recent: [recent[0] as RecentSettlement], amount: 900_000n })
    ).toEqual({ ok: true });
  });

  it("a charge larger than the whole budget can never fit, and says to retry after a full window", () => {
    expect(checkBudget({ ...base, recent: [], amount: 1_000_001n })).toEqual({
      ok: false,
      code: "budget_visitor",
      retryAfterSeconds: WINDOW_MS / 1000,
    });
  });

  it("still counts yesterday's charges against the visitor's budget when checked with both tags", () => {
    const recent = [entry("h1", 1000, A_YESTERDAY, 900_000n)];
    const verdict = checkBudget({ ...base, tags: [A, A_YESTERDAY], recent, amount: 200_000n });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe("budget_visitor");
  });
});

describe("readBudget", () => {
  it("parses USDC decimals, falls back on anything else and clamps to the maximum", () => {
    expect(readBudget("0.05", 1n)).toBe(500_000n);
    expect(readBudget("2", 1n)).toBe(20_000_000n);
    expect(readBudget("abc", 7n)).toBe(7n);
    expect(readBudget(undefined, 7n)).toBe(7n);
    expect(readBudget("999999", 7n)).toBe(1_000_000_000n);
  });
});

describe("mergeRecent", () => {
  it("adds local attempts Horizon has not ingested yet, without double counting", () => {
    const merged = mergeRecent([entry("h1", 1, A)], [entry("h1", 1, A, 5n), entry("h2", 2, A)]);
    expect(merged.map((item) => item.hash)).toEqual(["h1", "h2"]);
    expect(merged[0]?.charged).toBe(5n);
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
