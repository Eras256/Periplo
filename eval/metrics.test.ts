import { describe, expect, it } from "vitest";
import { ndcgAt10, reciprocalRank, summarize } from "./metrics.js";

describe("ndcgAt10", () => {
  it("is 1.0 when the single relevant result is ranked first", () => {
    expect(ndcgAt10([3], [3])).toBeCloseTo(1.0, 10);
  });

  it("is less than 1.0 when the relevant result is ranked lower", () => {
    const score = ndcgAt10([0, 3], [3]);
    // DCG = (2^3-1)/log2(3); IDCG = (2^3-1)/log2(2) = 7
    expect(score).toBeCloseTo(7 / Math.log2(3) / 7, 10);
    expect(score).toBeLessThan(1.0);
  });

  it("is 0 when no relevant result appears in the ranked list", () => {
    expect(ndcgAt10([0, 0, 0], [3])).toBe(0);
  });

  it("is 0 when there are no judged-relevant items at all (no ideal to normalize against)", () => {
    expect(ndcgAt10([1, 2], [])).toBe(0);
  });

  it("rewards the ideal ordering of multiple graded results", () => {
    // Best possible order (grade 3 then grade 1) should score 1.0.
    expect(ndcgAt10([3, 1], [3, 1])).toBeCloseTo(1.0, 10);
    // Reversed order scores lower.
    expect(ndcgAt10([1, 3], [3, 1])).toBeLessThan(1.0);
  });

  it("only considers the first 10 results", () => {
    const manyIrrelevant = new Array(15).fill(0);
    manyIrrelevant[12] = 3; // relevant item ranked 13th, outside top 10
    expect(ndcgAt10(manyIrrelevant, [3])).toBe(0);
  });
});

describe("reciprocalRank", () => {
  it("is 1 when the first result is relevant", () => {
    expect(reciprocalRank([3, 0, 0])).toBe(1);
  });

  it("is 1/rank for the first relevant result", () => {
    expect(reciprocalRank([0, 0, 2])).toBeCloseTo(1 / 3, 10);
  });

  it("is 0 when nothing relevant appears", () => {
    expect(reciprocalRank([0, 0, 0])).toBe(0);
  });

  it("treats any positive grade as relevant, not just the highest", () => {
    expect(reciprocalRank([0, 1])).toBeCloseTo(0.5, 10);
  });
});

describe("summarize", () => {
  it("averages nDCG@10 and MRR across queries", () => {
    const result = summarize([
      { ndcg10: 1.0, reciprocalRank: 1.0 },
      { ndcg10: 0.0, reciprocalRank: 0.5 },
    ]);
    expect(result.ndcg10).toBeCloseTo(0.5, 10);
    expect(result.mrr).toBeCloseTo(0.75, 10);
    expect(result.queryCount).toBe(2);
  });

  it("returns zeros for an empty query set rather than dividing by zero", () => {
    expect(summarize([])).toEqual({ ndcg10: 0, mrr: 0, queryCount: 0 });
  });
});
