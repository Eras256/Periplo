/**
 * Operational tool, not a demo: checks the configured fee-sponsor
 * account's real XLM balance and recent fee spend against live Horizon,
 * and exits non-zero when projected runway drops below the threshold
 * (default 48h, `docs/OPERATIONS.md`'s sponsor-key rotation runbook).
 *
 * Deliberately does not send a notification itself (no email/Slack/etc.
 * channel is configured anywhere in this repo, and inventing one here
 * would be scope this tool doesn't own): wire this into whatever already
 * runs scheduled checks for the deployment (a cron, a Fly scheduled
 * machine, a GitHub Actions workflow) and let its own failure-notification
 * path handle the alert, the same way a failing CI job already does.
 *
 * Reads the sponsor's PUBLIC key only, never the secret: this is a
 * read-only balance/history check, no signing capability needed.
 *
 * Usage (from repo root, after `nvm use 22`):
 *   node --env-file=apps/facilitator/.env apps/facilitator/scripts/sponsor-runway-alert.ts
 *   node ... sponsor-runway-alert.ts --network stellar:pubnet --threshold-hours 72
 */

import { fetchSponsorRunway } from "../src/sponsor-runway-fetch.js";

function parseArgs(argv: readonly string[]): {
  network: string;
  lookbackHours: number;
  thresholdHours: number;
} {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag?.startsWith("--") && value !== undefined) {
      flags.set(flag.slice(2), value);
    }
  }
  return {
    network: flags.get("network") ?? "stellar:testnet",
    lookbackHours: Number(flags.get("lookback-hours") ?? "24"),
    thresholdHours: Number(flags.get("threshold-hours") ?? "48"),
  };
}

function sponsorPublicKeyFor(network: string): string | undefined {
  if (network === "stellar:pubnet") {
    return process.env.STELLAR_FEE_SPONSOR_PUBLIC_PUBNET;
  }
  return process.env.STELLAR_FEE_SPONSOR_PUBLIC_TESTNET ?? process.env.STELLAR_FEE_SPONSOR_PUBLIC;
}

async function main(): Promise<void> {
  const { network, lookbackHours, thresholdHours } = parseArgs(process.argv.slice(2));
  const sponsorPublicKey = sponsorPublicKeyFor(network);
  if (!sponsorPublicKey) {
    console.error(
      `Missing sponsor public key for ${network}. Set STELLAR_FEE_SPONSOR_PUBLIC_TESTNET ` +
        "(or STELLAR_FEE_SPONSOR_PUBLIC), or STELLAR_FEE_SPONSOR_PUBLIC_PUBNET for pubnet."
    );
    process.exit(2);
  }

  const result = await fetchSponsorRunway(network, sponsorPublicKey, lookbackHours, thresholdHours);
  const balanceXlm = result.balanceStroops / 10_000_000;
  const burnRateXlmPerDay = (result.burnRateStroopsPerHour * 24) / 10_000_000;
  const runwayDescription = Number.isFinite(result.runwayHours)
    ? `${result.runwayHours.toFixed(1)}h`
    : "infinite (no fee spend observed in the lookback window)";

  console.log(`Fee-sponsor runway check: ${sponsorPublicKey} on ${network}`);
  console.log(`  Balance: ${balanceXlm.toFixed(7)} XLM`);
  console.log(
    `  Fee spend, last ${lookbackHours}h: ${(result.feeChargedStroopsInWindow / 10_000_000).toFixed(7)} XLM ` +
      `(~${burnRateXlmPerDay.toFixed(4)} XLM/day)`
  );
  console.log(`  Projected runway: ${runwayDescription}`);
  console.log(`  Threshold: ${thresholdHours}h`);

  if (result.belowThreshold) {
    console.error(
      `ALERT: projected runway (${runwayDescription}) is below the ${thresholdHours}h threshold. ` +
        `Top up ${sponsorPublicKey} on ${network}.`
    );
    process.exit(1);
  }

  console.log("OK: runway is above threshold.");
}

main().catch((error) => {
  console.error("sponsor-runway-alert failed:", error);
  process.exit(1);
});
