import { describe, expect, it } from "vitest";
import {
  extractCitedGithubItems,
  extractCitedTransactions,
  extractInternalLinks,
} from "./extract.js";

describe("extractCitedTransactions", () => {
  it("extracts a testnet transaction hash from a stellar.expert link", () => {
    const md =
      "settled: [`83d2aa3b60b7f8332e68082e2ed1f3e1ff7f4e01f4b4d987d9fca5c6c9d89f33`](https://stellar.expert/explorer/testnet/tx/83d2aa3b60b7f8332e68082e2ed1f3e1ff7f4e01f4b4d987d9fca5c6c9d89f33)";
    expect(extractCitedTransactions(md)).toEqual([
      {
        network: "testnet",
        hash: "83d2aa3b60b7f8332e68082e2ed1f3e1ff7f4e01f4b4d987d9fca5c6c9d89f33",
      },
    ]);
  });

  it("distinguishes testnet from pubnet for the same hash", () => {
    const hash = "a".repeat(64);
    const md = `https://stellar.expert/explorer/testnet/tx/${hash} and https://stellar.expert/explorer/pubnet/tx/${hash}`;
    expect(extractCitedTransactions(md)).toEqual([
      { network: "testnet", hash },
      { network: "pubnet", hash },
    ]);
  });

  it("deduplicates the same network+hash cited twice", () => {
    const hash = "b".repeat(64);
    const md = `first cite https://stellar.expert/explorer/testnet/tx/${hash}, second cite [again](https://stellar.expert/explorer/testnet/tx/${hash})`;
    expect(extractCitedTransactions(md)).toHaveLength(1);
  });

  it("lowercases a mixed-case hash so it dedupes and matches Horizon's own casing", () => {
    const hash = "AB".repeat(32); // 64 hex chars, mixed-case-looking (letters only)
    const md = `https://stellar.expert/explorer/testnet/tx/${hash}`;
    const result = extractCitedTransactions(md);
    expect(result[0]?.hash).toBe(hash.toLowerCase());
  });

  it("returns an empty array when nothing is cited", () => {
    expect(extractCitedTransactions("no transactions here")).toEqual([]);
  });

  it("ignores a hash of the wrong length", () => {
    const md = "https://stellar.expert/explorer/testnet/tx/deadbeef";
    expect(extractCitedTransactions(md)).toEqual([]);
  });
});

describe("extractCitedGithubItems", () => {
  it("extracts an issue link", () => {
    const md =
      "filed as [x402-foundation/x402#3169](https://github.com/x402-foundation/x402/issues/3169)";
    expect(extractCitedGithubItems(md)).toEqual([
      {
        owner: "x402-foundation",
        repo: "x402",
        kind: "issues",
        number: 3169,
        url: "https://github.com/x402-foundation/x402/issues/3169",
      },
    ]);
  });

  it("extracts a pull request link, distinct from an issue with the same number", () => {
    const md =
      "https://github.com/x402-foundation/x402/pull/3098 and https://github.com/x402-foundation/x402/issues/3098";
    const result = extractCitedGithubItems(md);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.kind).sort()).toEqual(["issues", "pull"]);
  });

  it("deduplicates the same issue cited twice", () => {
    const md =
      "https://github.com/OpenZeppelin/stellar-contracts/issues/839 ... later, [#839](https://github.com/OpenZeppelin/stellar-contracts/issues/839) again";
    expect(extractCitedGithubItems(md)).toHaveLength(1);
  });

  it("returns an empty array when nothing is cited", () => {
    expect(extractCitedGithubItems("no github links here")).toEqual([]);
  });
});

describe("extractInternalLinks", () => {
  it("extracts a relative doc link", () => {
    const md = "see [`docs/DEFERRED.md`](docs/DEFERRED.md) for the full log";
    expect(extractInternalLinks(md)).toEqual([
      { raw: "docs/DEFERRED.md", path: "docs/DEFERRED.md" },
    ]);
  });

  it("strips a trailing anchor from the checked path but keeps it in raw", () => {
    const md = "see [spec §6](docs/SPEC.md#6-security-requirements)";
    expect(extractInternalLinks(md)).toEqual([
      { raw: "docs/SPEC.md#6-security-requirements", path: "docs/SPEC.md" },
    ]);
  });

  it("ignores absolute http(s) links", () => {
    const md = "[live](https://periplo-testnet.fly.dev) and [repo](docs/SPEC.md)";
    expect(extractInternalLinks(md)).toEqual([{ raw: "docs/SPEC.md", path: "docs/SPEC.md" }]);
  });

  it("ignores a pure same-page anchor", () => {
    const md = "[jump down](#what-this-is) then [real link](docs/SPEC.md)";
    expect(extractInternalLinks(md)).toEqual([{ raw: "docs/SPEC.md", path: "docs/SPEC.md" }]);
  });

  it("ignores mailto: and other non-http schemes", () => {
    const md = "[email](mailto:test@example.com) and [doc](docs/SPEC.md)";
    expect(extractInternalLinks(md)).toEqual([{ raw: "docs/SPEC.md", path: "docs/SPEC.md" }]);
  });

  it("deduplicates the same raw link cited twice", () => {
    const md = "[a](docs/SPEC.md) ... [b](docs/SPEC.md)";
    expect(extractInternalLinks(md)).toHaveLength(1);
  });

  it("returns an empty array when nothing is cited", () => {
    expect(extractInternalLinks("no links here")).toEqual([]);
  });
});
