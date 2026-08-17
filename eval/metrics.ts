/**
 * nDCG@10 and MRR (spec §5 Phase 5 gate). Pure functions over a ranked
 * list of grades, no DB, no embeddings, so these get fast unit tests
 * independent of `run.ts`'s live-Supabase orchestration.
 */

/**
 * Discounted Cumulative Gain over the first `k` grades, in ranked order.
 * Standard graded-relevance formula: `sum (2^grade - 1) / log2(rank + 1)`.
 */
function dcgAtK(grades: readonly number[], k: number): number {
  let sum = 0;
  for (let i = 0; i < Math.min(grades.length, k); i++) {
    const grade = grades[i] ?? 0;
    const rank = i + 1;
    sum += (2 ** grade - 1) / Math.log2(rank + 1);
  }
  return sum;
}

/**
 * nDCG@10 for one query: `resultGrades` is the grade (0 if unjudged/
 * irrelevant) of each returned result, in the order the search returned
 * them. `idealGrades` is every judged-relevant grade for this query,
 * regardless of whether the search returned it, used to compute the ideal
 * (best-possible) ordering to normalize against.
 */
export function ndcgAt10(resultGrades: readonly number[], idealGrades: readonly number[]): number {
  const idcg = dcgAtK(
    [...idealGrades].sort((a, b) => b - a),
    10
  );
  if (idcg === 0) {
    return 0;
  }
  return dcgAtK(resultGrades, 10) / idcg;
}

/**
 * Mean Reciprocal Rank contribution for one query: `1 / rank` of the first
 * result with `grade > 0`, or `0` if no relevant result appears at all in
 * the ranked list passed in.
 */
export function reciprocalRank(resultGrades: readonly number[]): number {
  for (let i = 0; i < resultGrades.length; i++) {
    if ((resultGrades[i] ?? 0) > 0) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

export interface EvalSummary {
  readonly ndcg10: number;
  readonly mrr: number;
  readonly queryCount: number;
}

/** Averages nDCG@10 and MRR across every query's already-computed per-query score. */
export function summarize(
  perQuery: readonly { ndcg10: number; reciprocalRank: number }[]
): EvalSummary {
  const queryCount = perQuery.length;
  if (queryCount === 0) {
    return { ndcg10: 0, mrr: 0, queryCount: 0 };
  }
  const ndcg10 = perQuery.reduce((sum, q) => sum + q.ndcg10, 0) / queryCount;
  const mrr = perQuery.reduce((sum, q) => sum + q.reciprocalRank, 0) / queryCount;
  return { ndcg10, mrr, queryCount };
}
