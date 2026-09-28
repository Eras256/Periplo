import { PRICE_PER_TOKEN } from "./simulation";

/** Hard ceiling per real settlement: 1.00 USDC (7 decimals). Enforced by the server, never by the browser. */
export const MAX_CEILING = 10_000_000n;
/** Smallest ceiling the demo accepts: one token's price, same floor as the simulator's form. */
export const MIN_CEILING = PRICE_PER_TOKEN;
/** Upper bound on the declared token count; well above the ceiling's worth so "usage above the ceiling" is reachable. */
export const MAX_TOKENS = 1_000_000;
export const TESTNET_NETWORK = "stellar:testnet";

export interface SettleRequest {
  readonly ceiling: bigint;
  readonly tokens: number;
}

export type SettleRequestError =
  | "invalid_body"
  | "invalid_ceiling"
  | "ceiling_out_of_range"
  | "invalid_tokens"
  | "unsupported_network";

export type ParsedSettleRequest =
  | { readonly ok: true; readonly value: SettleRequest }
  | { readonly ok: false; readonly error: SettleRequestError };

/**
 * Accepts only what the route needs: an integer ceiling in base units (a decimal
 * string or a safe integer) and an integer token count. Any `network` other than
 * `stellar:testnet` is refused explicitly. Money is never taken from the client.
 */
export function parseSettleRequest(body: unknown): ParsedSettleRequest {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const { ceiling, tokens, network } = body as Record<string, unknown>;
  if (network !== undefined && network !== TESTNET_NETWORK) {
    return { ok: false, error: "unsupported_network" };
  }

  let ceilingUnits: bigint;
  if (typeof ceiling === "string" && /^\d{1,12}$/.test(ceiling)) {
    ceilingUnits = BigInt(ceiling);
  } else if (typeof ceiling === "number" && Number.isSafeInteger(ceiling) && ceiling >= 0) {
    ceilingUnits = BigInt(ceiling);
  } else {
    return { ok: false, error: "invalid_ceiling" };
  }
  if (ceilingUnits < MIN_CEILING || ceilingUnits > MAX_CEILING) {
    return { ok: false, error: "ceiling_out_of_range" };
  }

  if (
    typeof tokens !== "number" ||
    !Number.isSafeInteger(tokens) ||
    tokens < 0 ||
    tokens > MAX_TOKENS
  ) {
    return { ok: false, error: "invalid_tokens" };
  }
  return { ok: true, value: { ceiling: ceilingUnits, tokens } };
}

export interface Charge {
  /** What the usage costs at the fixed tariff, before the ceiling applies. */
  readonly cost: bigint;
  /** What is settled: `min(cost, ceiling)`. The contract rejects anything above the ceiling. */
  readonly actual: bigint;
  /** True when the usage cost more than the signed ceiling, so the charge stopped at the ceiling. */
  readonly capped: boolean;
}

export function computeCharge(request: SettleRequest): Charge {
  const cost = BigInt(request.tokens) * PRICE_PER_TOKEN;
  const capped = cost > request.ceiling;
  return { cost, actual: capped ? request.ceiling : cost, capped };
}

export type SettleErrorCode =
  | SettleRequestError
  | "rate_limited_visitor"
  | "rate_limited_global"
  | "budget_visitor"
  | "budget_global"
  | "demo_unavailable"
  | "demo_unfunded"
  | "busy"
  | "unconfirmed"
  | "failed";

export interface SettleSuccess {
  readonly status: "settled";
  readonly hash: string;
  readonly ledger: number;
  readonly network: typeof TESTNET_NETWORK;
  /** All amounts are base units as decimal strings, read from the confirmed `settled` event. */
  readonly ceiling: string;
  readonly cost: string;
  readonly capped: boolean;
  readonly settled: { readonly maxAmount: string; readonly actualAmount: string };
  readonly buyer: string;
  readonly seller: string;
}

export interface SettleFailure {
  readonly status: "error";
  readonly code: SettleErrorCode;
}

const HASH = /^[0-9a-f]{64}$/;
const UNITS = /^\d{1,20}$/;

/** Browser-side guard: a hash or amount is only shown if the whole response has the exact expected shape. */
export function parseSettleResponse(body: unknown): SettleSuccess | SettleFailure | null {
  if (typeof body !== "object" || body === null) return null;
  const value = body as Record<string, unknown>;
  if (value.status === "error" && typeof value.code === "string") {
    return { status: "error", code: value.code as SettleErrorCode };
  }
  if (value.status !== "settled") return null;
  const settled = value.settled as Record<string, unknown> | undefined;
  if (
    typeof value.hash !== "string" ||
    !HASH.test(value.hash) ||
    typeof value.ledger !== "number" ||
    value.network !== TESTNET_NETWORK ||
    typeof value.ceiling !== "string" ||
    !UNITS.test(value.ceiling) ||
    typeof value.cost !== "string" ||
    !UNITS.test(value.cost) ||
    typeof value.capped !== "boolean" ||
    typeof value.buyer !== "string" ||
    typeof value.seller !== "string" ||
    typeof settled !== "object" ||
    settled === null ||
    typeof settled.maxAmount !== "string" ||
    !UNITS.test(settled.maxAmount) ||
    typeof settled.actualAmount !== "string" ||
    !UNITS.test(settled.actualAmount)
  ) {
    return null;
  }
  return {
    status: "settled",
    hash: value.hash,
    ledger: value.ledger,
    network: TESTNET_NETWORK,
    ceiling: value.ceiling,
    cost: value.cost,
    capped: value.capped,
    settled: { maxAmount: settled.maxAmount, actualAmount: settled.actualAmount },
    buyer: value.buyer,
    seller: value.seller,
  };
}
