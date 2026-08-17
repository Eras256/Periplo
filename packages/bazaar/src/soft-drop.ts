/**
 * Soft-drop metadata extraction (spec Phase 1).
 *
 * A catalog listing carries several metadata fields beyond `routeTemplate`
 * (description, parameters, MIME type, ...). If one of those fields fails
 * its own validation rule, the right response is to drop *that field* and
 * keep the rest of the listing, not reject the whole listing. A seller
 * who gets one optional field wrong shouldn't lose their whole catalog
 * entry over it.
 *
 * This is deliberately generic and schema-agnostic: the concrete field
 * rules for a discovery `info` payload belong to Phase 4 (automatic
 * cataloging, where the actual wire schema is validated against), not
 * here. Phase 1 only builds the mechanism.
 *
 * **`routeTemplate` does NOT go through this.** It's the catalog key and
 * checked separately via `checkRouteTemplate` (`route-template.ts`), which
 * hard-rejects the whole listing when invalid: a listing can't exist
 * without a valid route, so there's nothing to "softly" keep.
 */

export interface FieldCheckResult {
  readonly valid: boolean;
  /** Required when `valid` is false: every drop carries a reason (spec §1). */
  readonly reason?: string;
}

export interface FieldRule {
  readonly field: string;
  readonly check: (value: unknown) => FieldCheckResult;
}

export interface DroppedField {
  readonly field: string;
  readonly reason: string;
}

export interface SoftDropResult<T extends Record<string, unknown>> {
  /** Fields present in the input that passed their rule. Fields absent from the input are simply absent here too, never "dropped". */
  readonly kept: Partial<T>;
  /** Fields present in the input that failed their rule, with why. */
  readonly dropped: readonly DroppedField[];
}

/**
 * Applies each rule's `check` to the corresponding field of `raw`, keeping
 * fields that pass and recording (with reason) fields that fail. A field
 * with no rule is ignored entirely (neither kept nor dropped): this
 * function only extracts what the caller told it to look for; it is not a
 * general-purpose "strip unknown keys" sanitizer.
 */
export function softDropFields<T extends Record<string, unknown>>(
  raw: Record<string, unknown>,
  rules: readonly FieldRule[]
): SoftDropResult<T> {
  const kept: Record<string, unknown> = {};
  const dropped: DroppedField[] = [];

  for (const rule of rules) {
    if (!(rule.field in raw)) {
      continue;
    }
    const value = raw[rule.field];
    const result = rule.check(value);
    if (result.valid) {
      kept[rule.field] = value;
    } else {
      dropped.push({
        field: rule.field,
        reason: result.reason ?? `"${rule.field}" failed validation`,
      });
    }
  }

  return { kept: kept as Partial<T>, dropped };
}
