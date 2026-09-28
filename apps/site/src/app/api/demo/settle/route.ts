import { computeCharge, parseSettleRequest, type SettleErrorCode } from "@/demo/settle-model";
import {
  checkBudget,
  checkLimits,
  DEFAULT_GLOBAL_BUDGET,
  DEFAULT_GLOBAL_LIMIT,
  DEFAULT_VISITOR_BUDGET,
  DEFAULT_VISITOR_LIMIT,
  MAX_GLOBAL_LIMIT,
  mergeRecent,
  type RecentSettlement,
  readBudget,
  readLimit,
  visitorTag,
} from "@/lib/demo-settle/limits";
import { createQueue, QueueFullError } from "@/lib/demo-settle/queue";
import {
  DemoSettleError,
  fetchRecentSettlements,
  loadConfig,
  settleOnTestnet,
} from "@/lib/demo-settle/settle";

// Node runtime (Stellar SDK, node:crypto). Hobby functions are capped at 60 s: the work
// deadline below stays well inside it so a slow confirmation is reported, not cut off.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WORK_BUDGET_MS = 50_000;
const MIN_TIME_TO_START_MS = 20_000;
const MAX_BODY_BYTES = 512;
const queue = createQueue(3);
/** Attempts this instance made that Horizon may not have ingested yet (per instance, best-effort). */
let recentLocal: RecentSettlement[] = [];

const STATUS: Record<SettleErrorCode, number> = {
  invalid_body: 400,
  invalid_ceiling: 400,
  ceiling_out_of_range: 400,
  invalid_tokens: 400,
  unsupported_network: 400,
  rate_limited_visitor: 429,
  rate_limited_global: 429,
  budget_visitor: 429,
  budget_global: 429,
  demo_unavailable: 503,
  demo_unfunded: 503,
  busy: 503,
  unconfirmed: 504,
  failed: 502,
};

function fail(code: SettleErrorCode, headers?: Record<string, string>) {
  return Response.json(
    { status: "error", code },
    { status: STATUS[code], headers: { "Cache-Control": "no-store", ...headers } }
  );
}

/** Vercel overwrites `x-forwarded-for` with the connecting address; only the first hop is used. */
function visitorAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

/** Structured, secret-free log line: codes and public hashes only, never keys, addresses of visitors or SDK messages. */
function log(event: string, fields: Record<string, string | number | boolean | undefined>) {
  console.info(JSON.stringify({ event: `demo_settle.${event}`, ...fields }));
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail("invalid_body");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("invalid_body");
  }
  const parsed = parseSettleRequest(body);
  if (!parsed.ok) return fail(parsed.error);

  const startedAt = Date.now();
  const deadline = startedAt + WORK_BUDGET_MS;
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig(process.env);
  } catch {
    log("unavailable", { code: "config" });
    return fail("demo_unavailable");
  }
  const pepper = (process.env.DEMO_RATE_PEPPER ?? "").trim();
  if (pepper.length < 32) {
    log("unavailable", { code: "pepper" });
    return fail("demo_unavailable");
  }
  const tag = visitorTag(visitorAddress(request), pepper);

  try {
    return await queue.run(async () => {
      if (deadline - Date.now() < MIN_TIME_TO_START_MS) return fail("busy");

      // The ledger is the counter: read the submitter's last 24 h of transactions. Failing to
      // read it fails closed, since an unreadable counter cannot enforce a cap.
      let recent: RecentSettlement[];
      try {
        recent = mergeRecent(await fetchRecentSettlements(config), recentLocal);
      } catch {
        log("unavailable", { code: "counter" });
        return fail("demo_unavailable");
      }
      const verdict = checkLimits({
        recent,
        tag,
        now: Date.now(),
        globalLimit: readLimit(
          process.env.DEMO_GLOBAL_DAILY_LIMIT,
          DEFAULT_GLOBAL_LIMIT,
          MAX_GLOBAL_LIMIT
        ),
        visitorLimit: readLimit(
          process.env.DEMO_VISITOR_DAILY_LIMIT,
          DEFAULT_VISITOR_LIMIT,
          MAX_GLOBAL_LIMIT
        ),
      });
      if (!verdict.ok) {
        log("limited", { code: verdict.code });
        return fail(verdict.code, { "Retry-After": String(verdict.retryAfterSeconds) });
      }

      const budget = checkBudget({
        recent,
        tag,
        now: Date.now(),
        amount: computeCharge(parsed.value).actual,
        visitorBudget: readBudget(process.env.DEMO_VISITOR_DAILY_BUDGET, DEFAULT_VISITOR_BUDGET),
        globalBudget: readBudget(process.env.DEMO_GLOBAL_DAILY_BUDGET, DEFAULT_GLOBAL_BUDGET),
      });
      if (!budget.ok) {
        log("limited", { code: budget.code });
        return fail(budget.code, { "Retry-After": String(budget.retryAfterSeconds) });
      }

      try {
        const outcome = await settleOnTestnet(config, parsed.value, tag, deadline);
        recentLocal = [outcome.local, ...recentLocal].filter(
          (entry) => Date.now() - entry.createdAt < 10 * 60 * 1000
        );
        log("settled", {
          hash: outcome.success.hash,
          ledger: outcome.success.ledger,
          capped: outcome.success.capped,
        });
        return Response.json(outcome.success, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        if (error instanceof DemoSettleError) {
          // A submitted-but-unconfirmed hash is logged (a hash is public) so it can be reconciled by hand.
          if (error.hash) {
            recentLocal = [
              {
                hash: error.hash,
                createdAt: Date.now(),
                visitorTag: tag,
                charged: parsed.value.ceiling,
              },
              ...recentLocal,
            ];
          }
          log("error", { code: error.code, detail: error.detail, hash: error.hash });
          return fail(error.code);
        }
        log("error", { code: "failed", detail: "unexpected" });
        return fail("failed");
      }
    });
  } catch (error) {
    if (error instanceof QueueFullError) return fail("busy", { "Retry-After": "30" });
    log("error", { code: "failed", detail: "route" });
    return fail("failed");
  }
}
