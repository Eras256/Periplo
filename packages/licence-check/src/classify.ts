import { ALLOWED_LICENSES, DENIED_PATTERNS } from "./allowlist.js";

export type Verdict = "allow" | "deny" | "review";

export interface PackageLicenseInfo {
  name: string;
  version: string;
  license: string | null | undefined;
  path?: string;
}

export interface ClassifiedPackage extends PackageLicenseInfo {
  verdict: Verdict;
  reason: string;
}

export interface CheckReport {
  packages: ClassifiedPackage[];
  denied: ClassifiedPackage[];
  review: ClassifiedPackage[];
  /** True only when there are zero denied packages. Review-only findings do not block the gate. */
  ok: boolean;
}

/**
 * Splits an SPDX-style expression such as "(MIT OR Apache-2.0)" or
 * "MIT AND ISC" into its individual license identifiers. Falls back to
 * treating the whole string as a single identifier when it isn't an
 * expression (the common case for plain "MIT", "Apache-2.0", etc.).
 */
function splitExpression(license: string): string[] {
  const stripped = license.trim().replace(/^\(/, "").replace(/\)$/, "");
  const parts = stripped.split(/\s+(?:OR|AND)\s+/i).map((part) => part.trim());
  return parts.filter((part) => part.length > 0);
}

export function classifyLicense(license: string | null | undefined): {
  verdict: Verdict;
  reason: string;
} {
  if (!license || license.trim().length === 0) {
    return { verdict: "review", reason: "no license field reported" };
  }

  const terms = splitExpression(license);

  // Deny wins outright: if ANY branch of an OR/AND expression is copyleft,
  // treat the whole package as denied. We cannot assume a downstream
  // consumer (or Periplo itself, transitively) picked the permissive
  // branch of a dual license, the safer default is to require an
  // unambiguous permissive grant.
  for (const term of terms) {
    const hit = DENIED_PATTERNS.find((pattern) => pattern.test(term));
    if (hit) {
      return { verdict: "deny", reason: `copyleft license: "${term}"` };
    }
  }

  const allTermsAllowed = terms.every((term) =>
    ALLOWED_LICENSES.some((allowed) => allowed.toLowerCase() === term.toLowerCase())
  );
  if (allTermsAllowed) {
    return { verdict: "allow", reason: `permissive: "${license}"` };
  }

  return { verdict: "review", reason: `unrecognised license expression: "${license}"` };
}

export function checkPackages(packages: readonly PackageLicenseInfo[]): CheckReport {
  const classified: ClassifiedPackage[] = packages.map((pkg) => {
    const { verdict, reason } = classifyLicense(pkg.license);
    return { ...pkg, verdict, reason };
  });

  const denied = classified.filter((pkg) => pkg.verdict === "deny");
  const review = classified.filter((pkg) => pkg.verdict === "review");

  return {
    packages: classified,
    denied,
    review,
    ok: denied.length === 0,
  };
}
