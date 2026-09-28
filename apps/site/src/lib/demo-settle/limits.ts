import { createHmac } from "node:crypto";
import { parseAmount } from "../../demo/amount";

export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_GLOBAL_LIMIT = 40;
export const DEFAULT_VISITOR_LIMIT = 5;
/** Horizon returns at most 200 rows per page; the counter reads one page, so the global cap must stay under it. */
export const MAX_GLOBAL_LIMIT = 150;
/** Daily USDC budgets, in 7-decimal base units, over the same rolling window. */
export const DEFAULT_VISITOR_BUDGET = 10_000_000n;
export const DEFAULT_GLOBAL_BUDGET = 100_000_000n;
export const MAX_BUDGET = 1_000_000_000n;

/** One settlement attempt the submitter account has already made, read from Horizon or remembered locally. */
export interface RecentSettlement {
  readonly hash: string;
  readonly createdAt: number;
  /** 32 hex chars: the visitor tag carried in the first 16 bytes of the authorization nonce, or `null` when unreadable. */
  readonly visitorTag: string | null;
  /** Base units actually charged (from the settled event); a submitted-but-unconfirmed attempt counts at its ceiling. */
  readonly charged: bigint;
}

export type LimitVerdict =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: "rate_limited_global" | "rate_limited_visitor";
      readonly retryAfterSeconds: number;
    };

/**
 * Keyed, one-way tag for a visitor address (16 bytes as 32 hex chars): the address
 * itself is never stored or logged. Soroban transactions cannot carry a memo, so the
 * tag travels as the first half of the authorization nonce, which stays on the ledger.
 */
export function visitorTag(address: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`visitor:${address}`).digest("hex").slice(0, 32);
}

export function readLimit(raw: string | undefined, fallback: number, max: number): number {
  if (raw === undefined || !/^\d{1,4}$/.test(raw.trim())) return fallback;
  return Math.min(Number(raw.trim()), max);
}

/**
 * Rolling 24 h window over the submitter account's own transactions. The
 * ledger is the counter: it survives cold starts and is shared by every
 * serverless instance, which in-memory state on Vercel is not.
 */
export function checkLimits(input: {
  readonly recent: readonly RecentSettlement[];
  readonly tag: string;
  readonly now: number;
  readonly globalLimit: number;
  readonly visitorLimit: number;
}): LimitVerdict {
  const inWindow = input.recent
    .filter((entry) => input.now - entry.createdAt < WINDOW_MS)
    .sort((a, b) => a.createdAt - b.createdAt);
  const retryAfter = (entries: readonly RecentSettlement[], limit: number): number => {
    const blocking = entries[entries.length - limit];
    const at = blocking ? blocking.createdAt + WINDOW_MS : input.now + WINDOW_MS;
    return Math.max(1, Math.ceil((at - input.now) / 1000));
  };

  const mine = inWindow.filter((entry) => entry.visitorTag === input.tag);
  if (mine.length >= input.visitorLimit) {
    return {
      ok: false,
      code: "rate_limited_visitor",
      retryAfterSeconds: retryAfter(mine, input.visitorLimit),
    };
  }
  if (inWindow.length >= input.globalLimit) {
    return {
      ok: false,
      code: "rate_limited_global",
      retryAfterSeconds: retryAfter(inWindow, input.globalLimit),
    };
  }
  return { ok: true };
}

/** Merges Horizon's view with attempts this instance made that Horizon may not have ingested yet. */
export function mergeRecent(
  fromHorizon: readonly RecentSettlement[],
  local: readonly RecentSettlement[]
): RecentSettlement[] {
  const localByHash = new Map(local.map((entry) => [entry.hash, entry]));
  const merged = fromHorizon.map((entry) => {
    const mine = localByHash.get(entry.hash);
    return mine && mine.charged > entry.charged ? { ...entry, charged: mine.charged } : entry;
  });
  const seen = new Set(fromHorizon.map((entry) => entry.hash));
  return [...merged, ...local.filter((entry) => !seen.has(entry.hash))];
}

export type BudgetVerdict =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: "budget_visitor" | "budget_global";
      readonly retryAfterSeconds: number;
    };

/** Reads a budget in USDC (`"1"`, `"0.05"`); anything else keeps the fallback, and it never exceeds `MAX_BUDGET`. */
export function readBudget(raw: string | undefined, fallback: bigint): bigint {
  const units = raw === undefined ? null : parseAmount(raw);
  return units === null ? fallback : units > MAX_BUDGET ? MAX_BUDGET : units;
}

function budgetFits(
  entries: readonly RecentSettlement[],
  amount: bigint,
  budget: bigint,
  now: number
): { readonly fits: true } | { readonly fits: false; readonly retryAfterSeconds: number } {
  const ordered = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  let total = ordered.reduce((sum, entry) => sum + entry.charged, 0n);
  if (total + amount <= budget) return { fits: true };
  for (const entry of ordered) {
    total -= entry.charged;
    if (total + amount <= budget) {
      return {
        fits: false,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.createdAt + WINDOW_MS - now) / 1000)),
      };
    }
  }
  return { fits: false, retryAfterSeconds: Math.ceil(WINDOW_MS / 1000) };
}

/**
 * Whether settling `amount` now stays inside the rolling-24 h USDC budgets. The amount is what
 * will actually be charged (the server prices it), so the check is exact rather than a ceiling reservation.
 */
export function checkBudget(input: {
  readonly recent: readonly RecentSettlement[];
  readonly tag: string;
  readonly now: number;
  readonly amount: bigint;
  readonly visitorBudget: bigint;
  readonly globalBudget: bigint;
}): BudgetVerdict {
  const inWindow = input.recent.filter((entry) => input.now - entry.createdAt < WINDOW_MS);
  const mine = inWindow.filter((entry) => entry.visitorTag === input.tag);
  const visitor = budgetFits(mine, input.amount, input.visitorBudget, input.now);
  if (!visitor.fits) {
    return { ok: false, code: "budget_visitor", retryAfterSeconds: visitor.retryAfterSeconds };
  }
  const global = budgetFits(inWindow, input.amount, input.globalBudget, input.now);
  if (!global.fits) {
    return { ok: false, code: "budget_global", retryAfterSeconds: global.retryAfterSeconds };
  }
  return { ok: true };
}
