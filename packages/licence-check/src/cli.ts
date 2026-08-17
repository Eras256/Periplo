#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { type ClassifiedPackage, checkPackages, type PackageLicenseInfo } from "./classify.js";

/**
 * Real shape of `pnpm licenses list --json` output (verified against pnpm
 * 11.20.0): grouped by license string, each group listing packages that
 * share it. NOT per-version entries: `versions`/`paths` are arrays,
 * indexed in parallel when a package resolved to more than one version.
 */
interface PnpmLicensesEntry {
  name: string;
  versions: string[];
  paths: string[];
  license?: string;
}

type PnpmLicensesOutput = Record<string, PnpmLicensesEntry[]>;

/**
 * `pnpm licenses list --json --prod` prints the plain-text line below
 * (not JSON) when the filtered dependency graph is empty, true today,
 * since Phase 0 has no runtime "dependencies" anywhere in the workspace
 * yet. Treated as zero packages rather than a parse error.
 */
const EMPTY_MARKER = "No licenses in packages found";

function loadPackageLicenses(extraArgs: readonly string[]): PackageLicenseInfo[] {
  const raw = execFileSync("pnpm", ["licenses", "list", "--json", ...extraArgs], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();

  if (raw.length === 0 || raw === EMPTY_MARKER) {
    return [];
  }

  const parsed = JSON.parse(raw) as PnpmLicensesOutput;

  const packages: PackageLicenseInfo[] = [];
  for (const [licenseGroup, entries] of Object.entries(parsed)) {
    for (const entry of entries) {
      const license = entry.license ?? licenseGroup;
      const versions = entry.versions.length > 0 ? entry.versions : ["unknown"];
      for (const [index, version] of versions.entries()) {
        const path = entry.paths[index];
        packages.push({
          name: entry.name,
          version,
          license,
          ...(path !== undefined ? { path } : {}),
        });
      }
    }
  }
  return packages;
}

function formatPackage(pkg: ClassifiedPackage): string {
  const location = pkg.path ? ` (${pkg.path})` : "";
  return `  - ${pkg.name}@${pkg.version}: ${pkg.reason}${location}`;
}

function main(): void {
  // Strict gate: what actually ships. `--prod` = "dependencies" +
  // "optionalDependencies", matching what a consumer installs at runtime
  // (spec §1: "No AGPL anywhere in the dependency path... operating the
  // code as a network service").
  const prodPackages = loadPackageLicenses(["--prod"]);
  const prodReport = checkPackages(prodPackages);

  // Full graph (prod + dev + optional): used only to surface dev-tooling
  // findings as warnings. devDependencies (e.g. vitest -> vite ->
  // lightningcss, MPL-2.0) are never bundled into a deployed Periplo
  // service, and MPL-2.0's copyleft obligation is file-level (modify-and-
  // distribute that file), not viral onto surrounding code, so an
  // unmodified build/test tool doesn't create the risk spec §1 targets.
  // They're still worth a human's attention, so they're reported, not
  // silently dropped.
  const allPackages = loadPackageLicenses([]);
  const allReport = checkPackages(allPackages);
  const prodKeys = new Set(prodReport.packages.map((pkg) => `${pkg.name}@${pkg.version}`));
  const devOnlyDenied = allReport.denied.filter(
    (pkg) => !prodKeys.has(`${pkg.name}@${pkg.version}`)
  );
  const devOnlyReview = allReport.review.filter(
    (pkg) => !prodKeys.has(`${pkg.name}@${pkg.version}`)
  );

  if (devOnlyDenied.length > 0) {
    console.warn(
      `licence-check: ${devOnlyDenied.length} dev-only package(s) are copyleft-licensed but not shipped (build/test tooling only), review, not blocking:`
    );
    for (const pkg of devOnlyDenied) {
      console.warn(formatPackage(pkg));
    }
  }

  const review = [...prodReport.review, ...devOnlyReview];
  if (review.length > 0) {
    console.warn(`licence-check: ${review.length} package(s) need manual license review:`);
    for (const pkg of review) {
      console.warn(formatPackage(pkg));
    }
  }

  if (!prodReport.ok) {
    console.error(
      `licence-check: FAILED: ${prodReport.denied.length} denied (copyleft) package(s) in the shipped (production) dependency graph:`
    );
    for (const pkg of prodReport.denied) {
      console.error(formatPackage(pkg));
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `licence-check: OK: ${prodReport.packages.length} production package(s) checked, 0 denied. ` +
      `(${allReport.packages.length} total incl. dev/build tooling.)`
  );
}

main();
