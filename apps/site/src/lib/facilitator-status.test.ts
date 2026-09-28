import { describe, expect, it } from "vitest";
import { parseFacilitatorStatus } from "./facilitator-status";

// Shapes as returned by https://periplo-testnet.fly.dev on 2026-09-27.
const SUPPORTED = {
  kinds: [
    {
      x402Version: 2,
      scheme: "exact",
      network: "stellar:testnet",
      extra: { areFeesSponsored: true },
    },
  ],
  extensions: ["bazaar"],
  signers: {
    "stellar:*": [
      "GDXULEKCDTYLN2RD7ID7ZTVUJVIDYPJTL7OY7DFN7Z5S4XKFFN6FOFLE",
      "GAZROUSFXRTCDUWL6HDGQDFAL5V2VZOQF25RYESIKZPHZQREPY7MWARE",
      "GCGA5WSVEEEVNNZ37ADIUZ5YO3UE6NLNA7EH7W4NG3PM5H7GRXXV7545",
      "GDOKGMQP4TYKJ6ZMDYTCIWQAV5BUTG5KJ2PCUJ4OQ6YS466IWBEDHJVV",
    ],
  },
};
const STATUS = {
  uptimeSeconds: 1463918,
  requestsServed: 97758,
  errorRate: 0.0005319257758955788,
  latencyP50Ms: 0,
  latencyP95Ms: 1,
  catalogSize: 58,
  lastSettledTransaction: {
    "stellar:testnet": {
      network: "stellar:testnet",
      transaction: "5c07fad27b369faf07be62ec982983c80f60634aebb9af403903801f6d7fedee",
      timestamp: "2026-09-27T20:00:00.000Z",
    },
  },
};
const NOW = new Date("2026-09-28T01:00:00Z");

describe("parseFacilitatorStatus", () => {
  it("keeps the real deployment's fields", () => {
    expect(parseFacilitatorStatus(SUPPORTED, STATUS, NOW)).toEqual({
      checkedAt: "2026-09-28T01:00:00.000Z",
      kinds: [{ scheme: "exact", network: "stellar:testnet" }],
      extensions: ["bazaar"],
      feePayers: 4,
      telemetry: {
        uptimeSeconds: 1463918,
        requestsServed: 97758,
        errorRate: 0.0005319257758955788,
        catalogSize: 58,
        lastSettlement: {
          network: "stellar:testnet",
          hash: "5c07fad27b369faf07be62ec982983c80f60634aebb9af403903801f6d7fedee",
          timestamp: "2026-09-27T20:00:00.000Z",
        },
      },
    });
  });

  it("returns null when /supported is unrecognizable", () => {
    expect(parseFacilitatorStatus(null, STATUS, NOW)).toBeNull();
    expect(parseFacilitatorStatus({ kinds: "exact" }, STATUS, NOW)).toBeNull();
    expect(parseFacilitatorStatus("<html>", STATUS, NOW)).toBeNull();
  });

  it("tolerates a missing /status", () => {
    expect(parseFacilitatorStatus(SUPPORTED, null, NOW)?.telemetry).toBeNull();
    expect(parseFacilitatorStatus(SUPPORTED, { uptimeSeconds: "1" }, NOW)?.telemetry).toBeNull();
  });

  it("drops injected or malformed values instead of rendering them", () => {
    const parsed = parseFacilitatorStatus(
      {
        kinds: [
          { scheme: "<img src=x onerror=alert(1)>", network: "stellar:testnet" },
          { scheme: "upto", network: "stellar:testnet" },
        ],
        extensions: ["bazaar", "<script>", 3],
        signers: {
          "stellar:*": [
            "not-an-account",
            "GDXULEKCDTYLN2RD7ID7ZTVUJVIDYPJTL7OY7DFN7Z5S4XKFFN6FOFLE",
          ],
        },
      },
      {
        ...STATUS,
        errorRate: 7,
        catalogSize: -1,
        lastSettledTransaction: {
          x: {
            network: "stellar:testnet",
            transaction: "javascript:alert(1)",
            timestamp: "2026-09-27T20:00:00Z",
          },
        },
      },
      NOW
    );
    expect(parsed?.kinds).toEqual([{ scheme: "upto", network: "stellar:testnet" }]);
    expect(parsed?.extensions).toEqual(["bazaar"]);
    expect(parsed?.feePayers).toBe(1);
    expect(parsed?.telemetry?.errorRate).toBe(1);
    expect(parsed?.telemetry?.catalogSize).toBeNull();
    expect(parsed?.telemetry?.lastSettlement).toBeNull();
  });
});
