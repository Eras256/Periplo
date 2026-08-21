/**
 * Pure extraction logic: given markdown source text, find every citation
 * this repo's own evidence standard depends on (README.md's own rule:
 * "README/doc claims need a link, a test, or a hash. No capability claims
 * without evidence"). No I/O here on purpose, mirrors
 * `packages/licence-check/src/classify.ts`'s split: this file is pure and
 * fully unit tested, `cli.ts` does the actual network/filesystem calls and
 * is exercised only through the gate itself.
 */

/** A Stellar transaction hash cited via a stellar.expert explorer link. */
export type CitedTransaction = {
  network: "testnet" | "pubnet";
  hash: string;
};

/** A GitHub issue or pull request cited as evidence. */
export type CitedGithubItem = {
  owner: string;
  repo: string;
  kind: "issues" | "pull";
  number: number;
  url: string;
};

/** A relative markdown link to another file in this repo. */
export type CitedInternalLink = {
  /** The link target exactly as written, before anchor stripping. */
  raw: string;
  /** The link target with any `#anchor` suffix removed. */
  path: string;
};

const STELLAR_EXPERT_TX_RE = /stellar\.expert\/explorer\/(testnet|pubnet)\/tx\/([0-9a-fA-F]{64})/g;

const GITHUB_ITEM_RE = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(issues|pull)\/(\d+)/g;

// Markdown inline links only: `[text](target)`. Excludes `http(s)://` and
// bare-scheme targets (mailto:, etc.), and excludes image embeds (`![...]`
// would still match this regex's `]\(`, but this repo has none in the
// files this tool scans, so that's not special-cased here).
const MARKDOWN_LINK_RE = /\]\(([^)\s]+)\)/g;

/** Every distinct Stellar transaction hash cited via a stellar.expert link. */
export function extractCitedTransactions(markdown: string): CitedTransaction[] {
  const seen = new Set<string>();
  const results: CitedTransaction[] = [];
  for (const match of markdown.matchAll(STELLAR_EXPERT_TX_RE)) {
    const network = match[1] as "testnet" | "pubnet";
    const hash = (match[2] ?? "").toLowerCase();
    const key = `${network}:${hash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ network, hash });
  }
  return results;
}

/** Every distinct GitHub issue/PR cited as evidence. */
export function extractCitedGithubItems(markdown: string): CitedGithubItem[] {
  const seen = new Set<string>();
  const results: CitedGithubItem[] = [];
  for (const match of markdown.matchAll(GITHUB_ITEM_RE)) {
    const [url, owner, repo, kind, numberStr] = match;
    if (!owner || !repo || !kind || !numberStr) continue;
    const key = `${owner}/${repo}/${kind}/${numberStr}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      owner,
      repo,
      kind: kind as "issues" | "pull",
      number: Number.parseInt(numberStr, 10),
      url: url ?? "",
    });
  }
  return results;
}

/**
 * Every distinct relative (same-repo) markdown link target. Excludes
 * absolute URLs (`http://`/`https://`/`mailto:`) and pure same-page
 * anchors (`#section`), which have nothing on disk to check.
 */
export function extractInternalLinks(markdown: string): CitedInternalLink[] {
  const seen = new Set<string>();
  const results: CitedInternalLink[] = [];
  for (const match of markdown.matchAll(MARKDOWN_LINK_RE)) {
    const raw = match[1];
    if (!raw) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) continue; // any URL scheme
    if (raw.startsWith("#")) continue; // pure same-page anchor
    const path = raw.split("#")[0] ?? raw;
    if (path.length === 0) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    results.push({ raw, path });
  }
  return results;
}
