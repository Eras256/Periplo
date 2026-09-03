/**
 * In-process operational telemetry (spec §8/§9/§10): "Publish operational
 * telemetry: requests served, error rate, latency p50/p95, catalog size,"
 * self-hosted, aggregate only, no PII, no third-party analytics. This
 * module tracks the request/latency/settlement side; `app.ts`'s `/status`
 * route adds catalog size (a live query, not tracked here) and returns
 * the combined snapshot.
 *
 * Deliberately in-memory, not persisted: resets on restart, which is an
 * honest limitation (a fresh deploy reports 0 uptime and an empty
 * request history, not history from before the restart), not a bug —
 * spec §9 only asks for aggregate operational metrics, not a durable
 * time series, and adding a database dependency just to survive a
 * restart would be scope beyond what's asked. See `docs/DEFERRED.md` if
 * a future round wants to persist this instead.
 */

export interface LastSettledTransaction {
  readonly network: string;
  readonly transaction: string;
  readonly timestamp: string;
}

export interface TelemetrySnapshot {
  readonly uptimeSeconds: number;
  readonly requestsServed: number;
  readonly errorCount: number;
  /** 0..1, not a percentage; `null` requests served yet is represented as 0, not NaN. */
  readonly errorRate: number;
  readonly latencyP50Ms: number | null;
  readonly latencyP95Ms: number | null;
  readonly lastSettledTransaction: Readonly<Record<string, LastSettledTransaction>>;
}

export interface TelemetryTracker {
  /** Call once per completed HTTP request, from the wrapping middleware in `app.ts`. */
  recordRequest(durationMs: number, isError: boolean): void;
  /** Call once per successful `/settle`, keyed by network (spec §10: "per network"). */
  recordSettlement(network: string, transaction: string): void;
  getSnapshot(): TelemetrySnapshot;
}

export interface CreateTelemetryTrackerOptions {
  /** Overridable for tests; defaults to `Date.now`. */
  readonly now?: () => number;
  /** Ring-buffer size for latency samples (default 1000): bounds memory, doesn't need exact history for a p50/p95 estimate. */
  readonly maxLatencySamples?: number;
}

function percentile(sortedAscending: readonly number[], p: number): number | null {
  if (sortedAscending.length === 0) return null;
  const index = Math.min(sortedAscending.length - 1, Math.floor(p * sortedAscending.length));
  return sortedAscending[index] ?? null;
}

export function createTelemetryTracker(
  options: CreateTelemetryTrackerOptions = {}
): TelemetryTracker {
  const now = options.now ?? (() => Date.now());
  const maxLatencySamples = options.maxLatencySamples ?? 1000;
  const bootedAtMs = now();

  let requestsServed = 0;
  let errorCount = 0;
  const latenciesMs: number[] = [];
  const lastSettledTransaction: Record<string, LastSettledTransaction> = {};

  return {
    recordRequest(durationMs, isError) {
      requestsServed += 1;
      if (isError) errorCount += 1;
      latenciesMs.push(durationMs);
      if (latenciesMs.length > maxLatencySamples) {
        latenciesMs.shift();
      }
    },
    recordSettlement(network, transaction) {
      lastSettledTransaction[network] = {
        network,
        transaction,
        timestamp: new Date(now()).toISOString(),
      };
    },
    getSnapshot() {
      const sorted = [...latenciesMs].sort((a, b) => a - b);
      return {
        uptimeSeconds: Math.floor((now() - bootedAtMs) / 1000),
        requestsServed,
        errorCount,
        errorRate: requestsServed === 0 ? 0 : errorCount / requestsServed,
        latencyP50Ms: percentile(sorted, 0.5),
        latencyP95Ms: percentile(sorted, 0.95),
        lastSettledTransaction: { ...lastSettledTransaction },
      };
    },
  };
}
