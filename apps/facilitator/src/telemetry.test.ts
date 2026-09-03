import { describe, expect, it } from "vitest";
import { createTelemetryTracker } from "./telemetry.js";

describe("createTelemetryTracker", () => {
  it("starts at zero requests, zero errors, null latencies, empty settlement map", () => {
    const tracker = createTelemetryTracker({ now: () => 1000 });
    expect(tracker.getSnapshot()).toEqual({
      uptimeSeconds: 0,
      requestsServed: 0,
      errorCount: 0,
      errorRate: 0,
      latencyP50Ms: null,
      latencyP95Ms: null,
      lastSettledTransaction: {},
    });
  });

  it("reports real elapsed uptime against the injected clock", () => {
    let time = 1_000_000;
    const tracker = createTelemetryTracker({ now: () => time });
    time += 65_000; // 65s later
    expect(tracker.getSnapshot().uptimeSeconds).toBe(65);
  });

  it("counts requests and errors independently", () => {
    const tracker = createTelemetryTracker({ now: () => 0 });
    tracker.recordRequest(10, false);
    tracker.recordRequest(20, true);
    tracker.recordRequest(30, false);
    const snapshot = tracker.getSnapshot();
    expect(snapshot.requestsServed).toBe(3);
    expect(snapshot.errorCount).toBe(1);
    expect(snapshot.errorRate).toBeCloseTo(1 / 3);
  });

  it("computes p50/p95 over recorded latencies", () => {
    const tracker = createTelemetryTracker({ now: () => 0 });
    // 100 samples, 10ms through 1000ms.
    for (let i = 1; i <= 100; i++) {
      tracker.recordRequest(i * 10, false);
    }
    const snapshot = tracker.getSnapshot();
    expect(snapshot.latencyP50Ms).toBe(510); // index 50 of 100 sorted samples
    expect(snapshot.latencyP95Ms).toBe(960); // index 95
  });

  it("bounds memory with a ring buffer: oldest samples drop once the cap is exceeded", () => {
    const tracker = createTelemetryTracker({ now: () => 0, maxLatencySamples: 3 });
    tracker.recordRequest(1000, false); // dropped
    tracker.recordRequest(10, false);
    tracker.recordRequest(20, false);
    tracker.recordRequest(30, false);
    // Only the last 3 samples (10, 20, 30) should remain, not the 1000ms outlier.
    expect(tracker.getSnapshot().latencyP95Ms).toBeLessThanOrEqual(30);
  });

  it("tracks the last settled transaction per network independently", () => {
    let time = 0;
    const tracker = createTelemetryTracker({ now: () => time });
    tracker.recordSettlement("stellar:testnet", "hash-1");
    time = 5000;
    tracker.recordSettlement("stellar:pubnet", "hash-2");
    time = 9000;
    tracker.recordSettlement("stellar:testnet", "hash-3"); // overwrites hash-1

    const { lastSettledTransaction } = tracker.getSnapshot();
    expect(lastSettledTransaction["stellar:testnet"]).toMatchObject({
      network: "stellar:testnet",
      transaction: "hash-3",
    });
    expect(lastSettledTransaction["stellar:pubnet"]).toMatchObject({
      network: "stellar:pubnet",
      transaction: "hash-2",
    });
  });

  it("getSnapshot returns an independent copy, not a live reference callers can mutate", () => {
    const tracker = createTelemetryTracker({ now: () => 0 });
    tracker.recordSettlement("stellar:testnet", "hash-1");
    const snapshot1 = tracker.getSnapshot();
    tracker.recordSettlement("stellar:testnet", "hash-2");
    expect(snapshot1.lastSettledTransaction["stellar:testnet"]?.transaction).toBe("hash-1");
  });
});
