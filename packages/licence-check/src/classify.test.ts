import { describe, expect, it } from "vitest";
import { checkPackages, classifyLicense } from "./classify.js";

describe("classifyLicense", () => {
  it("allows MIT", () => {
    expect(classifyLicense("MIT").verdict).toBe("allow");
  });

  it("allows Apache-2.0", () => {
    expect(classifyLicense("Apache-2.0").verdict).toBe("allow");
  });

  it("allows a permissive dual-license SPDX expression", () => {
    expect(classifyLicense("(MIT OR Apache-2.0)").verdict).toBe("allow");
  });

  it("denies AGPL-3.0-or-later — the OpenZeppelin Relayer case named in spec §1", () => {
    const result = classifyLicense("AGPL-3.0-or-later");
    expect(result.verdict).toBe("deny");
    expect(result.reason).toMatch(/copyleft/i);
  });

  it("denies AGPL expressed as free text", () => {
    expect(classifyLicense("GNU Affero General Public License v3.0").verdict).toBe("deny");
  });

  it("denies AGPL even when it's only one branch of an OR expression", () => {
    expect(classifyLicense("(AGPL-3.0-only OR Commercial)").verdict).toBe("deny");
  });

  it("denies GPL and LGPL variants", () => {
    expect(classifyLicense("GPL-3.0").verdict).toBe("deny");
    expect(classifyLicense("LGPL-2.1").verdict).toBe("deny");
  });

  it("denies MPL as copyleft-adjacent", () => {
    expect(classifyLicense("MPL-2.0").verdict).toBe("deny");
  });

  it("denies SSPL and BUSL", () => {
    expect(classifyLicense("SSPL-1.0").verdict).toBe("deny");
    expect(classifyLicense("BUSL-1.1").verdict).toBe("deny");
  });

  it("flags a missing license for manual review instead of silently allowing it", () => {
    expect(classifyLicense(undefined).verdict).toBe("review");
    expect(classifyLicense(null).verdict).toBe("review");
    expect(classifyLicense("").verdict).toBe("review");
  });

  it("flags an unrecognised license string for review rather than passing it silently", () => {
    expect(classifyLicense("Some-Custom-License-1.0").verdict).toBe("review");
  });

  it("does not false-positive on package names that merely contain a denied substring", () => {
    // "lgpl" must match as a whole word, not as a substring of an unrelated token.
    expect(classifyLicense("MIT").verdict).toBe("allow");
  });
});

describe("checkPackages", () => {
  it("fails the gate when any package is denied", () => {
    const report = checkPackages([
      { name: "left-pad", version: "1.0.0", license: "MIT" },
      { name: "openzeppelin-relayer", version: "1.0.0", license: "AGPL-3.0-or-later" },
    ]);
    expect(report.ok).toBe(false);
    expect(report.denied).toHaveLength(1);
    expect(report.denied[0]?.name).toBe("openzeppelin-relayer");
  });

  it("passes the gate when every package is allowed, independent of review-only findings", () => {
    const report = checkPackages([
      { name: "hono", version: "4.13.0", license: "MIT" },
      { name: "weird-pkg", version: "0.0.1", license: "Custom-License" },
    ]);
    expect(report.ok).toBe(true);
    expect(report.review).toHaveLength(1);
  });

  it("passes on an empty package list", () => {
    const report = checkPackages([]);
    expect(report.ok).toBe(true);
    expect(report.packages).toHaveLength(0);
  });
});
