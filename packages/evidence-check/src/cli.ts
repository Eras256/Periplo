#!/usr/bin/env node
/**
 * The actual gate: re-confirms every piece of evidence this repo cites in
 * README.md and conformance/RESULTS.md is still real, on every push, not
 * just at the moment it was written. Three kinds of citation, three kinds
 * of check:
 *
 * 1. Stellar transaction hashes (cited via stellar.expert links): checked
 *    directly against Horizon, `successful: true` required, same standard
 *    conformance/RESULTS.md itself already documents for how these hashes
 *    were originally verified.
 * 2. Internal doc links (`docs/X.md`, `packages/...`, etc.): checked
 *    against the actual filesystem, so a rename/move that forgot to
 *    update the README fails the gate instead of silently 404ing for a
 *    reviewer.
 * 3. GitHub issue/PR links: checked against the GitHub API, so a
 *    deleted/transferred issue is caught rather than only found by a
 *    reviewer clicking it.
 *
 * Deliberately not unit tested, same split as
 * packages/licence-check/src/cli.ts: this file only wires real network
 * and filesystem calls together, the parsing logic it calls
 * (`extract.ts`) is what's actually tested.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type CitedGithubItem,
  type CitedInternalLink,
  type CitedTransaction,
  extractCitedGithubItems,
  extractCitedTransactions,
  extractInternalLinks,
} from "./extract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

// Files this gate scans. Deliberately narrow: these are the two files
// this repo's own evidence standard treats as canonical (README.md's
// "What's real right now" section, conformance/RESULTS.md's evidence
// table), not a repo-wide markdown crawl, which would also flag internal
// links inside docs/DEFERRED.md's own historical narrative that were
// never meant to be checked live.
const SCANNED_FILES = ["README.md", "conformance/RESULTS.md"];

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const HORIZON_PUBNET = "https://horizon.stellar.org";
const FACILITATOR_URL = "https://periplo-testnet.fly.dev";

type Failure = { kind: string; detail: string };

async function checkTransaction(tx: CitedTransaction, failures: Failure[]): Promise<void> {
  const base = tx.network === "testnet" ? HORIZON_TESTNET : HORIZON_PUBNET;
  const url = `${base}/transactions/${tx.hash}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      failures.push({
        kind: "transaction",
        detail: `${tx.network}/${tx.hash}: Horizon returned ${res.status} (${url})`,
      });
      return;
    }
    const body = (await res.json()) as { successful?: boolean };
    if (body.successful !== true) {
      failures.push({
        kind: "transaction",
        detail: `${tx.network}/${tx.hash}: Horizon reports successful=${String(body.successful)}, expected true`,
      });
    }
  } catch (err) {
    failures.push({
      kind: "transaction",
      detail: `${tx.network}/${tx.hash}: request to Horizon failed: ${String(err)}`,
    });
  }
}

async function checkGithubItem(item: CitedGithubItem, failures: Failure[]): Promise<void> {
  const url = `https://api.github.com/repos/${item.owner}/${item.repo}/issues/${item.number}`;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      failures.push({
        kind: "github",
        detail: `${item.owner}/${item.repo}#${item.number} (${item.kind}): GitHub API returned ${res.status} (${item.url})`,
      });
    }
  } catch (err) {
    failures.push({
      kind: "github",
      detail: `${item.owner}/${item.repo}#${item.number}: request to GitHub failed: ${String(err)}`,
    });
  }
}

function checkInternalLink(sourceFile: string, link: CitedInternalLink, failures: Failure[]): void {
  const sourceDir = dirname(resolve(REPO_ROOT, sourceFile));
  const target = resolve(sourceDir, link.path);
  if (!existsSync(target)) {
    failures.push({
      kind: "internal-link",
      detail: `${sourceFile} links to "${link.raw}", but ${link.path} does not exist on disk`,
    });
  }
}

async function checkLiveFacilitator(failures: Failure[]): Promise<void> {
  const url = `${FACILITATOR_URL}/supported`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      failures.push({ kind: "live-deployment", detail: `GET ${url} returned ${res.status}` });
      return;
    }
    const body = (await res.json()) as { kinds?: unknown };
    if (!Array.isArray(body.kinds)) {
      failures.push({
        kind: "live-deployment",
        detail: `GET ${url} returned 200 but the body has no "kinds" array, shape doesn't match what README.md claims is live`,
      });
    }
  } catch (err) {
    failures.push({
      kind: "live-deployment",
      detail: `request to the live facilitator (${url}) failed: ${String(err)}`,
    });
  }
}

async function main(): Promise<void> {
  const failures: Failure[] = [];
  const transactions = new Map<string, CitedTransaction>();
  const githubItems = new Map<string, CitedGithubItem>();

  for (const file of SCANNED_FILES) {
    const text = await readFile(resolve(REPO_ROOT, file), "utf8");
    for (const tx of extractCitedTransactions(text))
      transactions.set(`${tx.network}:${tx.hash}`, tx);
    for (const item of extractCitedGithubItems(text)) {
      githubItems.set(`${item.owner}/${item.repo}/${item.kind}/${item.number}`, item);
    }
    for (const link of extractInternalLinks(text)) checkInternalLink(file, link, failures);
  }

  console.log(
    `Checking ${transactions.size} transaction hash(es), ${githubItems.size} GitHub issue/PR link(s), across ${SCANNED_FILES.join(", ")}...`
  );

  const txChecks = [...transactions.values()].map((tx) => checkTransaction(tx, failures));
  const ghChecks = [...githubItems.values()].map((item) => checkGithubItem(item, failures));

  await Promise.all([...txChecks, ...ghChecks, checkLiveFacilitator(failures)]);

  if (failures.length > 0) {
    console.error(`\nEvidence check failed: ${failures.length} citation(s) no longer check out.\n`);
    for (const f of failures) console.error(`  [${f.kind}] ${f.detail}`);
    console.error(
      "\nEither the cited evidence has genuinely rotted (fix or remove the claim), or this gate has a false positive (fix the gate). Never silence this by deleting the citation without checking which one it is."
    );
    process.exitCode = 1;
    return;
  }

  console.log("All cited evidence still checks out.");
}

main().catch((err) => {
  console.error("evidence-check crashed:", err);
  process.exitCode = 1;
});
