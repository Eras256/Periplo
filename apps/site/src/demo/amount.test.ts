import { describe, expect, it } from "vitest";
import { formatAmount, parseAmount } from "./amount";

describe("parseAmount", () => {
  it("parses decimals into 7-decimal base units", () => {
    expect(parseAmount("0.1")).toBe(1_000_000n);
    expect(parseAmount("2")).toBe(20_000_000n);
    expect(parseAmount("0,05")).toBe(500_000n);
    expect(parseAmount("0.0000001")).toBe(1n);
  });

  it("rejects anything that is not a plain non-negative decimal", () => {
    for (const input of ["", "-1", "abc", "1e3", "0.00000001", "1.2.3"]) {
      expect(parseAmount(input)).toBeNull();
    }
  });
});

describe("formatAmount", () => {
  it("keeps at least two decimals and trims trailing zeros", () => {
    expect(formatAmount(1_000_000n)).toBe("0.10");
    expect(formatAmount(500_000n)).toBe("0.05");
    expect(formatAmount(1n)).toBe("0.0000001");
    expect(formatAmount(20_000_000n)).toBe("2.00");
    expect(formatAmount(123_456n, 4)).toBe("0.0123");
  });
});
