/**
 * `pnpm eval` (spec §5 Phase 5 gate): seeds the fixed synthetic catalog
 * (`fixtures.ts`) through the real cataloging write path
 * (`@periplo/bazaar`'s `upsertCatalogResource`, the same function
 * `apps/facilitator/src/discovery.ts` calls for a real payment), embeds
 * and runs every query in `golden.jsonl` through the real hybrid search
 * RPC, computes nDCG@10 and MRR, and compares against the committed
 * baseline (`eval/baseline.json`). Exits non-zero if nDCG@10 regresses
 * more than 5% — the CI-blocking half of the gate.
 *
 * Needs `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` — unlike the
 * integration test suites elsewhere in this repo, this does NOT skip
 * gracefully without them: the Phase 5 gate is `pnpm eval` printing real
 * numbers on every release, not an optional suite.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type CatalogAcceptsEntry,
  createServiceRoleClient,
  type Database,
  upsertCatalogResource,
} from "@periplo/bazaar";
import { buildDiscoveryText, embedDocument, embedQuery, hybridSearch } from "@periplo/search";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type CatalogFixture, FIXTURES } from "./fixtures.js";
import { ndcgAt10, reciprocalRank, summarize } from "./metrics.js";

const EVAL_DIR = fileURLToPath(new URL(".", import.meta.url));
const BASELINE_PATH = `${EVAL_DIR}baseline.json`;
const GOLDEN_PATH = `${EVAL_DIR}golden.jsonl`;

/** Regression tolerance from spec §5's gate: "CI fails if nDCG@10 regresses more than 5%." */
const REGRESSION_TOLERANCE = 0.05;

const EVAL_ACCEPT: CatalogAcceptsEntry = {
  scheme: "exact",
  network: "stellar:testnet",
  asset: "CEVALFIXTURE",
  amount: "1",
  payTo: "GEVALFIXTURE",
  maxTimeoutSeconds: 60,
};

interface GoldenQuery {
  readonly query: string;
  readonly relevant: readonly { id: string; grade: number }[];
}

function loadGoldenQueries(): GoldenQuery[] {
  const lines = readFileSync(GOLDEN_PATH, "utf8")
    .split("\n")
    .filter((line) => line.trim());
  return lines.map((line) => JSON.parse(line) as GoldenQuery);
}

function fixtureUrl(fixture: CatalogFixture): string {
  return fixture.type === "mcp"
    ? `mcp://tool/${fixture.toolName}`
    : `https://periplo-eval-fixture.example${fixture.routeTemplate ?? `/${fixture.id}`}`;
}

function loadEnv(): { url: string; serviceRoleKey: string } {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file (CI) — env vars are expected to be set directly.
  }
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error(
      "pnpm eval requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY — this gate does not skip without them (spec §5 Phase 5)."
    );
    process.exit(1);
  }
  return { url, serviceRoleKey };
}

async function seedFixtures(client: SupabaseClient<Database>): Promise<void> {
  for (const fixture of FIXTURES) {
    const embedding = await embedDocument(
      buildDiscoveryText({ description: fixture.description, parameters: fixture.parameters })
    );
    await upsertCatalogResource(client, {
      url: fixtureUrl(fixture),
      routeTemplate: fixture.type === "http" ? (fixture.routeTemplate ?? null) : null,
      toolName: fixture.type === "mcp" ? (fixture.toolName ?? null) : null,
      type: fixture.type,
      description: fixture.description,
      parameters: fixture.parameters,
      accept: EVAL_ACCEPT,
      extensionKeys: ["bazaar"],
      embedding,
    });
  }
}

async function cleanupFixtures(client: SupabaseClient<Database>): Promise<void> {
  for (const fixture of FIXTURES) {
    await client.from("resources").delete().eq("url", fixtureUrl(fixture));
  }
}

interface Baseline {
  readonly ndcg10: number;
  readonly mrr: number;
}

async function main(): Promise<void> {
  const { url, serviceRoleKey } = loadEnv();
  const client = createServiceRoleClient(url, serviceRoleKey);
  const fixturesById = new Map(FIXTURES.map((f) => [f.id, f]));
  const golden = loadGoldenQueries();

  console.log(`Seeding ${FIXTURES.length} fixture resources...`);
  await seedFixtures(client);

  try {
    console.log(`Running ${golden.length} golden queries...`);
    const perQuery: { ndcg10: number; reciprocalRank: number }[] = [];

    for (const { query, relevant } of golden) {
      const gradeById = new Map(relevant.map((r) => [r.id, r.grade]));
      const queryEmbedding = await embedQuery(query);
      const results = await hybridSearch(client, { query, queryEmbedding, limit: 20 });

      const resultGrades = results.map((row) => {
        const fixture = [...fixturesById.values()].find((f) => fixtureUrl(f) === row.url);
        return fixture ? (gradeById.get(fixture.id) ?? 0) : 0;
      });
      const idealGrades = relevant.map((r) => r.grade);

      perQuery.push({
        ndcg10: ndcgAt10(resultGrades, idealGrades),
        reciprocalRank: reciprocalRank(resultGrades),
      });
    }

    const summary = summarize(perQuery);
    console.log(`\nnDCG@10: ${summary.ndcg10.toFixed(4)}`);
    console.log(`MRR:     ${summary.mrr.toFixed(4)}`);
    console.log(`Queries: ${summary.queryCount}`);

    let baseline: Baseline | null = null;
    try {
      baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
    } catch {
      // No committed baseline yet — bootstrap it below.
    }

    if (!baseline) {
      writeFileSync(
        BASELINE_PATH,
        `${JSON.stringify({ ndcg10: summary.ndcg10, mrr: summary.mrr }, null, 2)}\n`
      );
      console.log(`\nNo baseline found — wrote ${BASELINE_PATH}. Commit it.`);
      return;
    }

    const regression = (baseline.ndcg10 - summary.ndcg10) / baseline.ndcg10;
    console.log(`\nBaseline nDCG@10: ${baseline.ndcg10.toFixed(4)}`);
    if (regression > REGRESSION_TOLERANCE) {
      console.error(
        `\nnDCG@10 regressed ${(regression * 100).toFixed(1)}% against the committed baseline ` +
          `(tolerance: ${(REGRESSION_TOLERANCE * 100).toFixed(0)}%). Failing (spec §5 Phase 5 gate).`
      );
      process.exitCode = 1;
      return;
    }
    console.log("Within regression tolerance.");
  } finally {
    await cleanupFixtures(client);
  }
}

main().catch((error) => {
  console.error("eval failed:", error);
  process.exit(1);
});
