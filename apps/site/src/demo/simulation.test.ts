import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRICE_PER_TOKEN, startMetering, sumUsage, type UsageEvent } from "./simulation";

describe("startMetering", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("never lets the running total exceed the signed ceiling", () => {
    const events: UsageEvent[] = [];
    const onCeilingReached = vi.fn();
    const ceiling = 1_000_000n;
    startMetering({
      ceiling,
      onEvent: (event) => events.push(event),
      onCeilingReached,
      nextTokens: () => 1499,
      intervalMs: 10,
    });
    vi.advanceTimersByTime(10_000);

    expect(onCeilingReached).toHaveBeenCalledOnce();
    expect(sumUsage(events)).toBeLessThanOrEqual(ceiling);
    expect(ceiling - sumUsage(events)).toBeLessThan(PRICE_PER_TOKEN);
    expect(events.at(-1)?.tokens).toBeLessThan(1499);
  });

  it("stops emitting once stopped", () => {
    const events: UsageEvent[] = [];
    const stop = startMetering({
      ceiling: 10_000_000n,
      onEvent: (event) => events.push(event),
      onCeilingReached: () => {},
      nextTokens: () => 100,
      intervalMs: 10,
    });
    vi.advanceTimersByTime(35);
    stop();
    vi.advanceTimersByTime(1_000);
    expect(events).toHaveLength(3);
  });

  it("reports the ceiling immediately when it cannot afford a single token", () => {
    const onEvent = vi.fn();
    const onCeilingReached = vi.fn();
    startMetering({ ceiling: PRICE_PER_TOKEN - 1n, onEvent, onCeilingReached, intervalMs: 10 });
    vi.advanceTimersByTime(10);
    expect(onEvent).not.toHaveBeenCalled();
    expect(onCeilingReached).toHaveBeenCalledOnce();
  });
});
