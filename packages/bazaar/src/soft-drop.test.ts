import { describe, expect, it } from "vitest";
import { type FieldRule, softDropFields } from "./soft-drop.js";

const isNonEmptyString: FieldRule = {
  field: "description",
  check: (value) =>
    typeof value === "string" && value.length > 0
      ? { valid: true }
      : { valid: false, reason: "description must be a non-empty string" },
};

const isPositiveNumber: FieldRule = {
  field: "amount",
  check: (value) =>
    typeof value === "number" && value > 0
      ? { valid: true }
      : { valid: false, reason: "amount must be a positive number" },
};

describe("softDropFields", () => {
  it("keeps a field that passes its rule", () => {
    const result = softDropFields<{ description: string }>({ description: "weather API" }, [
      isNonEmptyString,
    ]);
    expect(result.kept).toEqual({ description: "weather API" });
    expect(result.dropped).toEqual([]);
  });

  it("drops a field that fails its rule, with the rule's reason", () => {
    const result = softDropFields({ description: "" }, [isNonEmptyString]);
    expect(result.kept).toEqual({});
    expect(result.dropped).toEqual([
      { field: "description", reason: "description must be a non-empty string" },
    ]);
  });

  it("keeps the rest of the listing when only one field fails (the actual soft-drop guarantee)", () => {
    const result = softDropFields({ description: "", amount: 100 }, [
      isNonEmptyString,
      isPositiveNumber,
    ]);
    expect(result.kept).toEqual({ amount: 100 });
    expect(result.dropped).toEqual([
      { field: "description", reason: "description must be a non-empty string" },
    ]);
  });

  it("drops multiple independently-failing fields, each with its own reason", () => {
    const result = softDropFields({ description: "", amount: -5 }, [
      isNonEmptyString,
      isPositiveNumber,
    ]);
    expect(result.kept).toEqual({});
    expect(result.dropped).toHaveLength(2);
    expect(result.dropped.map((d) => d.field).sort()).toEqual(["amount", "description"]);
  });

  it("uses a default reason when the rule's check doesn't provide one", () => {
    const noReasonRule: FieldRule = { field: "x", check: () => ({ valid: false }) };
    const result = softDropFields({ x: 1 }, [noReasonRule]);
    expect(result.dropped).toEqual([{ field: "x", reason: '"x" failed validation' }]);
  });

  it("ignores fields present in the input with no matching rule (not kept, not dropped)", () => {
    const result = softDropFields({ description: "ok", mystery: "field" }, [isNonEmptyString]);
    expect(result.kept).toEqual({ description: "ok" });
    expect("mystery" in result.kept).toBe(false);
    expect(result.dropped).toEqual([]);
  });

  it("treats a field absent from the input as absent, not dropped", () => {
    const result = softDropFields({}, [isNonEmptyString]);
    expect(result.kept).toEqual({});
    expect(result.dropped).toEqual([]);
  });

  it("returns empty kept/dropped for an empty rule set", () => {
    const result = softDropFields({ description: "ok", amount: 5 }, []);
    expect(result.kept).toEqual({});
    expect(result.dropped).toEqual([]);
  });

  it("does not leak a dropped field's value into kept", () => {
    const result = softDropFields({ description: 12345 }, [isNonEmptyString]);
    expect(result.kept).not.toHaveProperty("description");
  });

  it("handles a realistic mixed listing (some valid, some invalid, some unrecognised fields)", () => {
    const raw = {
      description: "Current conditions by city",
      amount: 0,
      routeTemplate: "/weather/{city}", // deliberately not covered by a rule here, see module doc
    };
    const result = softDropFields(raw, [isNonEmptyString, isPositiveNumber]);
    expect(result.kept).toEqual({ description: "Current conditions by city" });
    expect(result.dropped).toEqual([
      { field: "amount", reason: "amount must be a positive number" },
    ]);
    expect(result.kept).not.toHaveProperty("routeTemplate");
  });
});
