#!/usr/bin/env node
// Regenerates src/data/upstream.json from the live GitHub API.
// Run: pnpm --filter @periplo/site snapshot:upstream   (needs an authenticated `gh`)
//
// Which items count as Periplo's is a human decision, kept here, not
// inferred from the `Eras256` author field (that identity is shared with
// other projects, see .claude/skills/upstream-github-check). The list is
// the Eras256-authored issues/PRs that README.md or docs/DEFERRED.md record
// as filed by this project, minus:
// - OpenZeppelin/stellar-contracts#840: the maintainer showed the finding
//   was wrong (docs/DEFERRED.md), so it is not presented as a contribution.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ITEMS = [
  "OpenZeppelin/stellar-contracts#839",
  "OpenZeppelin/stellar-contracts#863",
  "StellarCN/py-stellar-base#1215",
  "stellar/js-stellar-sdk#1655",
  "stellar/js-stellar-sdk#1672",
  "stellar/js-stellar-sdk#1681",
  "stellar/js-stellar-sdk#1683",
  "stellar/js-stellar-sdk#1699",
  "stellar/stellar-dev-skill#103",
  "x402-foundation/x402#3098",
  "x402-foundation/x402#3121",
  "x402-foundation/x402#3138",
  "x402-foundation/x402#3169",
  "x402-foundation/x402#3172",
  "x402-foundation/x402#3187",
  "x402-foundation/x402#3215",
  "x402-foundation/x402#3228",
  "x402-foundation/x402#3270",
  "x402-foundation/x402#3332",
  "x402-foundation/x402#3333",
  "x402-foundation/x402#3334",
  "x402-foundation/x402#3336",
  "x402-foundation/x402#3338",
  "x402-foundation/x402#3339",
  "x402-foundation/x402#3341",
];

function fetchItem(ref) {
  const [repo, number] = ref.split("#");
  const raw = execFileSync("gh", ["api", `repos/${repo}/issues/${number}`], { encoding: "utf8" });
  const issue = JSON.parse(raw);
  const isPr = Boolean(issue.pull_request);
  let state;
  if (issue.state === "open") state = "open";
  else if (isPr) state = issue.pull_request.merged_at ? "merged" : "closed_unmerged";
  else state = issue.state_reason === "not_planned" ? "closed_not_planned" : "closed_completed";
  return {
    ref,
    repo,
    number: Number(number),
    kind: isPr ? "pr" : "issue",
    title: issue.title,
    url: issue.html_url,
    state,
    createdAt: issue.created_at,
    closedAt: issue.closed_at,
  };
}

const items = ITEMS.map(fetchItem);
const out = { checkedAt: new Date().toISOString(), items };
const target = join(dirname(fileURLToPath(import.meta.url)), "../src/data/upstream.json");
writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${items.length} items to ${target}`);
