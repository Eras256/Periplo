// Real, end-to-end browser verification of /demo/play: launches headless
// Chromium against a REAL RUNNING SERVER (point PERIPLO_URL at one, e.g.
// `node --env-file=.env dist/serve.js` locally, or the live deployment
// once configured), clicks the actual button, and waits for a real
// settled transaction to appear on the page. Not part of `pnpm test`
// (spends real testnet PTEST and needs a live server + a real browser),
// same category as the other `*-demo.ts`/`*-verify.ts` scripts.
//
// Usage: node apps/facilitator/scripts/demo-play-browser-verify.mjs
//   (PERIPLO_URL defaults to http://localhost:8402)
import { chromium } from "@playwright/test";

const baseUrl = process.env.PERIPLO_URL ?? "http://localhost:8402";

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));

console.log(`Navigating to ${baseUrl}/demo/play ...`);
await page.goto(`${baseUrl}/demo/play`);

console.log("Clicking 'Pay and convert'...");
const started = Date.now();
await page.click("#pay-button");

console.log("Waiting for a real result (up to 40s)...");
await page.waitForSelector("#result:not([hidden])", { timeout: 40_000 });
const elapsedMs = Date.now() - started;

const resultHtml = await page.$eval("#result", (el) => el.innerHTML);
const errorHidden = await page.$eval("#error", (el) => el.hidden);

console.log(`\nResult appeared after ${elapsedMs}ms.`);
console.log("Error box hidden (expected true):", errorHidden);
console.log("Result HTML:\n", resultHtml);

if (consoleErrors.length > 0) {
  console.log("\nBrowser console errors captured:");
  for (const e of consoleErrors) console.log(" -", e);
}

const txHashMatch = resultHtml.match(/tx\/([0-9a-f]{64})/);
if (!txHashMatch) {
  console.error("\nFAILED: no real transaction hash found in the result HTML.");
  process.exit(1);
}
console.log(`\nReal transaction hash found: ${txHashMatch[1]}`);
console.log(`https://stellar.expert/explorer/testnet/tx/${txHashMatch[1]}`);

const horizonRes = await fetch(
  `https://horizon-testnet.stellar.org/transactions/${txHashMatch[1]}`
);
const horizonJson = await horizonRes.json();
console.log("Horizon confirms successful:", horizonJson.successful);

await browser.close();

if (!horizonJson.successful) {
  console.error("FAILED: Horizon does not confirm this transaction as successful.");
  process.exit(1);
}
if (!errorHidden) {
  console.error("FAILED: error box was visible.");
  process.exit(1);
}

console.log("\nBROWSER FLOW VERIFIED END TO END, IN A REAL HEADLESS BROWSER.");
