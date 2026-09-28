/**
 * GOYA HACK (Stellar track, CriptoUNAM) demo script, NOT part of `pnpm test`.
 * Runs a real metered "dataset query" API in-process, has the buyer sign an
 * `upto` ceiling BEFORE the query runs, then settles for the REAL usage
 * against a dedicated demo instance of the same `UptoSettlement` contract
 * (`contracts/upto-settlement`) deployed today for this hackathon entry —
 * a different contract ID from the one `conformance/RESULTS.md` cites as
 * SCF evidence, so this traffic never touches that trail.
 *
 * Usage (from repo root, after `nvm use 22`):
 *   node --env-file=.env apps/facilitator/scripts/goyahack-metered-settle-demo.ts
 */

import { randomBytes } from "node:crypto";
import http from "node:http";
import { Keypair, rpc } from "@stellar/stellar-sdk";
import { Client as ContractClient } from "@stellar/stellar-sdk/contract";

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
const GOYAHACK_CONTRACT_ID =
  process.env.GOYAHACK_UPTO_CONTRACT_TESTNET ??
  "CA7OYVXWPSQHXNBWJQZ7TCKQILAVBHWDAPNRJTKY66LHR5K5LFXRV6TW";

const FEE_SPONSOR_SECRET = process.env.STELLAR_FEE_SPONSOR_SECRET;
const BUYER_SECRET = process.env.STELLAR_TEST_BUYER_SECRET;
const SELLER_PUBLIC = process.env.STELLAR_TEST_SELLER_PUBLIC;
const ASSET_ADDRESS = process.env.STELLAR_TEST_ASSET_ADDRESS;

if (!FEE_SPONSOR_SECRET || !BUYER_SECRET || !SELLER_PUBLIC || !ASSET_ADDRESS) {
  console.error(
    "Missing one of: STELLAR_FEE_SPONSOR_SECRET, STELLAR_TEST_BUYER_SECRET, " +
      "STELLAR_TEST_SELLER_PUBLIC, STELLAR_TEST_ASSET_ADDRESS"
  );
  process.exit(1);
}

// Metered "dataset query" API: bills only for rows actually matched and
// returned, capped at whatever ceiling the buyer signed for.
const DATASET = [
  "XLM settles in about 5 seconds per ledger.",
  "Soroban is Stellar's smart contract platform.",
  "SEP-41 defines the fungible token interface Soroban contracts use.",
  "A Soroban contract's WASM is capped at 128KB by protocol.",
  "Horizon indexes classic Stellar ledger operations for querying.",
  "Soroban RPC is the preferred interface for contract simulation.",
  "CAP-71 introduced delegated Soroban credentials.",
  "A trustline is required before holding a non-native classic asset.",
  "The Stellar Asset Contract bridges classic assets into Soroban.",
  "Soroban's require_auth_for_args scopes a signature to specific arguments.",
  "Testnet resets periodically; pubnet state is permanent.",
  "A Soroban contract's temporary storage entries expire on a TTL.",
  "Channel accounts let one signer submit many transactions concurrently.",
  "x402 is an HTTP-native payment protocol using the 402 status code.",
  "Fee-bump transactions let a sponsor pay fees for someone else's transaction.",
  "Soroban simulation returns the resource footprint before submission.",
  "The upto scheme lets a buyer sign a ceiling, not a fixed charge.",
  "A Stellar account's sequence number must increase by exactly one per transaction.",
  "Oracles feed price data into Soroban contracts.",
  "Anchors implement SEP-24 for deposit and withdrawal flows.",
];
const PRICE_PER_ROW_STROOPS = 50_000n; // 0.005 PTEST at 7 decimals

function queryDataset(q: string, maxRows: number): string[] {
  return DATASET.filter((row) => row.toLowerCase().includes(q.toLowerCase())).slice(0, maxRows);
}

function startMeteredServer(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const q = url.searchParams.get("q") ?? "";
      const maxRows = Number.parseInt(url.searchParams.get("maxRows") ?? "0", 10);
      const rows = queryDataset(q, maxRows);
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          rows,
          rowsReturned: rows.length,
          pricePerRowStroops: PRICE_PER_ROW_STROOPS.toString(),
        })
      );
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, port: typeof address === "object" && address ? address.port : 0 });
    });
  });
}

async function main(): Promise<void> {
  const { server, port } = await startMeteredServer();
  try {
    const rpcServer = new rpc.Server(RPC_URL);
    const facilitator = Keypair.fromSecret(FEE_SPONSOR_SECRET as string);
    const buyer = Keypair.fromSecret(BUYER_SECRET as string);

    const latestLedger = await rpcServer.getLatestLedger();
    const currentLedger = latestLedger.sequence;
    console.log(`Contract instance: ${GOYAHACK_CONTRACT_ID}`);
    console.log(`Current testnet ledger: ${currentLedger}`);

    // The buyer signs this ceiling BEFORE the metered query runs.
    const requestedMaxRows = 20;
    const maxAmount = PRICE_PER_ROW_STROOPS * BigInt(requestedMaxRows);
    const nonce = randomBytes(32);
    const authorization = {
      from: buyer.publicKey(),
      to: SELLER_PUBLIC as string,
      asset: ASSET_ADDRESS as string,
      max_amount: maxAmount,
      valid_after_ledger: currentLedger,
      deadline_ledger: currentLedger + 30,
      nonce,
      facilitator: facilitator.publicKey(),
    };

    console.log("\nCeiling signed by the buyer (before the query runs):");
    console.log({ ...authorization, nonce: nonce.toString("hex") });

    const response = await fetch(
      `http://127.0.0.1:${port}/dataset?q=soroban&maxRows=${requestedMaxRows}`
    );
    const { rows, rowsReturned, pricePerRowStroops } = (await response.json()) as {
      rows: string[];
      rowsReturned: number;
      pricePerRowStroops: string;
    };
    console.log(`\nMetered API returned ${rowsReturned} row(s) for query "soroban":`);
    for (const row of rows) console.log(`  - ${row}`);

    const actualAmount = BigInt(pricePerRowStroops) * BigInt(rowsReturned);

    const client = await ContractClient.from({
      contractId: GOYAHACK_CONTRACT_ID,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: facilitator.publicKey(),
      signTransaction: facilitator,
    });

    console.log("\nBuilding and simulating settle() for the real usage amount...");
    const tx = await (
      client as unknown as {
        settle: (
          args: { authorization: typeof authorization; actual_amount: bigint },
          opts?: Record<string, unknown>
        ) => Promise<any>;
      }
    ).settle({ authorization, actual_amount: actualAmount });

    if ((tx.simulation as any)?.error) {
      console.error("Simulation failed:", (tx.simulation as any).error);
      process.exit(1);
    }

    await tx.signAuthEntries({ address: buyer.publicKey(), signAuthEntry: buyer });

    console.log("\nSubmitting (facilitator sponsors the fee, settles the real amount)...");
    const sent = await tx.signAndSend();
    const hash = sent.sendTransactionResponse?.hash ?? (sent as any).getTransactionResponse?.txHash;

    console.log("\n=== Ceiling vs. actual ===");
    console.log(`Signed ceiling:   ${maxAmount.toString()} stroops (${requestedMaxRows} rows max)`);
    console.log(`Actually settled: ${actualAmount.toString()} stroops (${rowsReturned} rows used)`);
    console.log(`\nSETTLED on stellar:testnet: ${hash}`);
    console.log(`https://stellar.expert/explorer/testnet/tx/${hash}`);
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
