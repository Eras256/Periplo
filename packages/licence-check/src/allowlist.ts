/**
 * License classification for Periplo's dependency graph.
 *
 * Constraint (master spec §1): Apache-2.0 project, operated as a network
 * service. No AGPL anywhere in the dependency path, and no other copyleft
 * license that would impose share-alike or source-disclosure obligations on
 * operators of this service (self-hosters included, see §3, deployment
 * path 2).
 *
 * Denials are matched by pattern against each individual identifier inside
 * a package's reported license string (which may itself be an SPDX
 * expression like "(MIT OR Apache-2.0)", or free-text such as
 * "GNU Affero General Public License v3.0 or later"). Deny wins over allow:
 * see classifyLicense in classify.ts for why a dual license with ANY
 * copyleft branch is still denied.
 */

export const ALLOWED_LICENSES: readonly string[] = [
  "MIT",
  "Apache-2.0",
  "Apache 2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "ISC",
  "CC0-1.0",
  "Unlicense",
  "Python-2.0",
  "BlueOak-1.0.0",
];

/**
 * Copyleft (or copyleft-adjacent) license families, denied regardless of
 * version or "-only" / "-or-later" suffix. Matched case-insensitively so
 * "AGPL-3.0-or-later", "GNU Affero General Public License v3.0", etc. all
 * hit the same rule. This is deliberately broader than "AGPL only": spec §1
 * says "fail the build on any copyleft transitive," not just AGPL, and
 * names the OpenZeppelin Relayer (AGPL-3.0-or-later) as the concrete case
 * to catch.
 */
export const DENIED_PATTERNS: readonly RegExp[] = [
  /agpl/i,
  /affero/i,
  /\bgpl\b/i,
  /gnu general public license/i,
  /\blgpl\b/i,
  /gnu lesser general public license/i,
  /\bmpl\b/i,
  /mozilla public license/i,
  /\bsspl\b/i,
  /server side public license/i,
  /\bbusl\b/i,
  /business source license/i,
  /cc-by-sa/i,
  /\beupl\b/i,
  /\bosl\b/i,
  /open software license/i,
];
