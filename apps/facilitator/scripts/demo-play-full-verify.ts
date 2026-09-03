/**
 * End-to-end verification of the FULL wallet-less demo flow
 * (`/demo/play`'s underlying logic), run from Node before ever trusting
 * the browser bundle: generate an ephemeral keypair, fund it via
 * friendbot, onboard it with a trustline + PTEST via the faucet
 * transaction, then actually pay the live demo resource with it and
 * confirm a real settled transaction. If this script doesn't work for
 * real, the browser page built on the same logic won't either — this is
 * the thing to run first, and to re-run if the browser flow ever looks
 * broken.
 *
 * Usage (from repo root, after `nvm use 22`):
 *   node --env-file=apps/facilitator/.env apps/facilitator/scripts/demo-play-full-verify.ts
 */

import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme as ExactStellarClientScheme } from "@x402/stellar/exact/client";
import { prepareFaucetTransaction } from "../src/demo-faucet.js";

const FAUCET_SECRET = process.env.STELLAR_TEST_BUYER_SECRET as string;
const ASSET_ISSUER = "GDRTPOXBIW7JXFR7KMBTGIBOLV66I6XOKMTR3OMFYSZZF2V2HUSGPTZX";
const DEMO_URL =
  "https://periplo-testnet.fly.dev/demo/temperature-convert?value=100&from=celsius&to=fahrenheit";

function base64Encode(json: string): string {
  return Buffer.from(json, "utf8").toString("base64");
}
function base64Decode(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf8");
}

async function main() {
  console.log("1. Generating ephemeral keypair...");
  const ephemeral = Keypair.random();
  console.log("   ", ephemeral.publicKey());

  console.log("2. Funding via testnet friendbot...");
  const fundRes = await fetch(`https://friendbot.stellar.org/?addr=${ephemeral.publicKey()}`);
  if (!fundRes.ok) throw new Error(`friendbot failed: ${fundRes.status}`);
  console.log("    funded");

  console.log("3. Preparing + submitting the trustline+PTEST onboarding transaction...");
  const prepared = await prepareFaucetTransaction(ephemeral.publicKey(), {
    faucetSecret: FAUCET_SECRET,
    assetCode: "PTEST",
    assetIssuer: ASSET_ISSUER,
    grantAmount: "1",
  });
  const onboardTx = TransactionBuilder.fromXDR(prepared.transactionXdr, prepared.networkPassphrase);
  onboardTx.sign(ephemeral);
  const onboardSubmit = await fetch("https://horizon-testnet.stellar.org/transactions", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `tx=${encodeURIComponent(onboardTx.toXDR())}`,
  });
  if (!onboardSubmit.ok) {
    console.error(await onboardSubmit.text());
    throw new Error("onboarding tx failed");
  }
  console.log("    onboarded (trustline + 1 PTEST)");

  console.log("4. Requesting the demo resource (expecting 402)...");
  const res1 = await fetch(DEMO_URL);
  console.log("    status:", res1.status);
  if (res1.status !== 402) throw new Error(`expected 402, got ${res1.status}`);
  const paymentRequiredHeader = res1.headers.get("payment-required");
  if (!paymentRequiredHeader) throw new Error("no payment-required header");
  const paymentRequired = JSON.parse(base64Decode(paymentRequiredHeader)) as {
    accepts: Array<{ scheme: string; network: string; [k: string]: unknown }>;
  };
  const requirements = paymentRequired.accepts.find(
    (a) => a.scheme === "exact" && a.network === "stellar:testnet"
  );
  if (!requirements) throw new Error("no exact/stellar:testnet option offered");
  console.log("    requirements:", JSON.stringify(requirements));

  console.log("5. Signing the payment with the ephemeral key...");
  const signer = createEd25519Signer(ephemeral.secret(), "stellar:testnet");
  const client = new ExactStellarClientScheme(signer);
  // biome-ignore lint/suspicious/noExplicitAny: paymentRequirements shape from the decoded header matches @x402/core's own type at runtime; not worth importing the full type just for this verification script.
  const built = await client.createPaymentPayload(2, requirements as any);
  const paymentPayload = { ...built, accepted: requirements };
  const paymentSignatureHeader = base64Encode(JSON.stringify(paymentPayload));

  console.log("6. Submitting the paid request...");
  const res2 = await fetch(DEMO_URL, {
    headers: { "PAYMENT-SIGNATURE": paymentSignatureHeader },
  });
  console.log("    status:", res2.status);
  const body = await res2.json();
  console.log("    body:", JSON.stringify(body));
  if (!res2.ok) throw new Error("payment failed");

  const paymentResponseHeader = res2.headers.get("payment-response");
  const settlement = paymentResponseHeader ? JSON.parse(base64Decode(paymentResponseHeader)) : null;
  console.log("7. Settlement confirmation:", JSON.stringify(settlement, null, 2));

  const txHash = (settlement as { transaction?: string } | null)?.transaction;
  if (txHash) {
    console.log(`\nReal settled transaction: https://stellar.expert/explorer/testnet/tx/${txHash}`);
    const horizonCheck = await fetch(`https://horizon-testnet.stellar.org/transactions/${txHash}`);
    const horizonJson = (await horizonCheck.json()) as { successful?: boolean };
    console.log("Horizon confirms successful:", horizonJson.successful);
  }

  console.log("\nFULL FLOW VERIFIED END TO END.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
