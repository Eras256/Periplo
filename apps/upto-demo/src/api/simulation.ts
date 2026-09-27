/**
 * In-browser simulation of the UptoSettlement flow. It never touches the
 * network and never produces a transaction hash. It exists so a visitor
 * can drive the flow themselves while the metered backend is not yet
 * connected to this page; real settlements are read separately from
 * testnet (`chain-settlements.ts`).
 */

/** Simulated tariff: 100 base units (0.00001 PTEST) per generated token. */
export const PRICE_PER_TOKEN = 100n;

export interface UsageEvent {
  readonly id: number;
  readonly tokens: number;
  readonly amount: bigint;
}

export interface MeteringOptions {
  readonly ceiling: bigint;
  readonly onEvent: (event: UsageEvent) => void;
  readonly onCeilingReached: () => void;
  /** Injectable for tests; defaults to 150-1500 tokens per call. */
  readonly nextTokens?: () => number;
  readonly intervalMs?: number;
}

export function randomTokens(): number {
  return 150 + Math.floor(Math.random() * 1350);
}

/**
 * Emits usage events until stopped or until the running total reaches the
 * ceiling. The last event is truncated to the remaining headroom, so the
 * total never exceeds what was signed: the same invariant the contract
 * enforces with `actual_amount <= max_amount`.
 */
export function startMetering(options: MeteringOptions): () => void {
  const nextTokens = options.nextTokens ?? randomTokens;
  const intervalMs = options.intervalMs ?? 1100;
  let total = 0n;
  let id = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = () => {
    const remaining = options.ceiling - total;
    const requestedTokens = nextTokens();
    const affordableTokens = Number(remaining / PRICE_PER_TOKEN);
    const tokens = Math.min(requestedTokens, affordableTokens);
    if (tokens > 0) {
      const amount = BigInt(tokens) * PRICE_PER_TOKEN;
      total += amount;
      id += 1;
      options.onEvent({ id, tokens, amount });
    }
    if (tokens < requestedTokens) {
      options.onCeilingReached();
      return;
    }
    timer = setTimeout(tick, intervalMs);
  };

  timer = setTimeout(tick, intervalMs);
  return () => clearTimeout(timer);
}

export function sumUsage(events: readonly UsageEvent[]): bigint {
  return events.reduce((sum, event) => sum + event.amount, 0n);
}
