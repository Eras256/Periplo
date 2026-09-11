/**
 * Live Horizon data-fetching half of the sponsor runway check
 * (`sponsor-runway.ts` has the pure computation this feeds). Separated so
 * `computeSponsorRunway` stays unit-testable with fixed inputs and this
 * file is exercised only by `scripts/sponsor-runway-alert.ts`, the same
 * split `boot-safety.ts`/`core.ts` already draw between pure checks and
 * real network I/O.
 */

import {
  computeSponsorRunway,
  type HorizonAccount,
  type HorizonTransactionRecord,
  type RunwayCheckResult,
} from "./sponsor-runway.js";

export function horizonUrlForNetwork(network: string): string {
  switch (network) {
    case "stellar:testnet":
      return "https://horizon-testnet.stellar.org";
    case "stellar:pubnet":
      return "https://horizon.stellar.org";
    default:
      throw new Error(`sponsor-runway-fetch: unknown network "${network}"`);
  }
}

const TRANSACTIONS_PAGE_LIMIT = 200;
/** Safety cap on pages fetched, independent of the lookback window: a
 * sponsor account under real load could in principle have more
 * transactions in-window than one page holds, but an unbounded loop
 * against a live paginated endpoint is its own failure mode. Five pages
 * (1,000 transactions) comfortably covers this project's own real
 * testnet volume (`conformance/RESULTS.md`'s whole transaction history is
 * far smaller than that) with room to grow. */
const MAX_PAGES = 5;

async function fetchTransactionsSince(
  horizonUrl: string,
  sponsorPublicKey: string,
  cutoff: Date,
  fetchImpl: typeof fetch
): Promise<HorizonTransactionRecord[]> {
  const collected: HorizonTransactionRecord[] = [];
  let url =
    `${horizonUrl}/accounts/${sponsorPublicKey}/transactions` +
    `?order=desc&limit=${TRANSACTIONS_PAGE_LIMIT}`;

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(
        `sponsor-runway-fetch: Horizon returned ${response.status} fetching transactions for ` +
          `${sponsorPublicKey}`
      );
    }
    const body = (await response.json()) as {
      _embedded: { records: HorizonTransactionRecord[] };
      _links: { next: { href: string } };
    };
    const records = body._embedded.records;
    if (records.length === 0) {
      break;
    }

    let hitCutoff = false;
    for (const record of records) {
      if (new Date(record.created_at) < cutoff) {
        hitCutoff = true;
        break;
      }
      collected.push(record);
    }
    // Horizon returns transactions newest-first, so the first record older
    // than the cutoff means every subsequent record on this and later
    // pages is older still: safe to stop rather than fetch further pages.
    if (hitCutoff || records.length < TRANSACTIONS_PAGE_LIMIT) {
      break;
    }
    url = body._links.next.href;
  }

  return collected;
}

/**
 * Fetches the sponsor's current native balance and its transaction
 * history for the last `lookbackHours`, then runs `computeSponsorRunway`
 * over the real data. `fetchImpl` is injectable for tests; defaults to
 * the global `fetch`.
 */
export async function fetchSponsorRunway(
  network: string,
  sponsorPublicKey: string,
  lookbackHours = 24,
  thresholdHours = 48,
  fetchImpl: typeof fetch = fetch
): Promise<RunwayCheckResult> {
  const horizonUrl = horizonUrlForNetwork(network);
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

  const [accountResponse, transactionsInWindow] = await Promise.all([
    fetchImpl(`${horizonUrl}/accounts/${sponsorPublicKey}`),
    fetchTransactionsSince(horizonUrl, sponsorPublicKey, cutoff, fetchImpl),
  ]);

  if (!accountResponse.ok) {
    throw new Error(
      `sponsor-runway-fetch: Horizon returned ${accountResponse.status} loading account ` +
        `${sponsorPublicKey} on ${network}`
    );
  }
  const account = (await accountResponse.json()) as HorizonAccount;

  return computeSponsorRunway(
    account,
    transactionsInWindow,
    sponsorPublicKey,
    network,
    lookbackHours,
    thresholdHours
  );
}
