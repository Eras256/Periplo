/**
 * `/demo/play`: a wallet-less, one-click demo of a real x402 payment.
 * Built on top of `demo-resource.ts`'s existing paid endpoint
 * (`/demo/temperature-convert`) — this module adds the human-facing page
 * and the faucet endpoint the browser needs to actually have something
 * to pay with, it never touches verify/settle logic itself (spec §1:
 * that stays in `core.ts`/`@x402/stellar`).
 *
 * Success looks like: a visitor with no wallet, no testnet funds, and no
 * prior x402 knowledge clicks one button and sees a real settled Stellar
 * transaction, verifiable on Horizon/stellar.expert with one more click.
 * Measured end to end from a real Node run of the identical flow
 * (`scripts/demo-play-full-verify.ts`): ~15 seconds, not the "under 10
 * seconds" a first draft of this feature's own spec assumed — Stellar's
 * real ~5s ledger close time, multiplied across three sequential real
 * transactions (friendbot funding, the trustline+token onboarding
 * transaction, the actual demo payment), makes single digits physically
 * unreachable on testnet, not a code inefficiency to optimize away.
 *
 * The browser bundle is built once, in-process, at first request (not a
 * committed build artifact, not rebuilt on every request either): esbuild's
 * JS API bundles `browser/demo-play-main.ts` (which pulls in
 * `demo-play-client.ts`, `@x402/stellar`'s client scheme, and
 * `@stellar/stellar-sdk`) into a single browser-target ESM file, cached
 * in memory for the life of the process.
 */

import { build } from "esbuild";
import type { Context, Hono } from "hono";
import { prepareFaucetTransaction } from "./demo-faucet.js";

export interface DemoPlayConfig {
  /** The URL of the paid resource this page pays (demo-resource.ts's own route, e.g. `${baseUrl}/demo/temperature-convert`). */
  readonly resourceUrl: string;
  /** Faucet account's own secret (reused STELLAR_TEST_BUYER_SECRET, see demo-faucet.ts's own doc comment for why). */
  readonly faucetSecret: string;
  readonly assetCode: string;
  readonly assetIssuer: string;
  /** Whole-unit decimal amount of the asset granted per visitor (default "1"). */
  readonly grantAmount?: string;
}

let cachedBundle: string | null = null;

async function getBundledClientScript(): Promise<string> {
  if (cachedBundle) return cachedBundle;
  const result = await build({
    entryPoints: [new URL("./browser/demo-play-main.ts", import.meta.url).pathname],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    // @stellar/stellar-sdk references `Buffer`/`process` in a couple of
    // code paths that only ever execute on the Node fallback branch (see
    // core.ts's own comment on `safeBase64Encode`'s dual browser/Node
    // implementation); esbuild's own minimal shims are enough to satisfy
    // the reference at bundle time without ever executing that branch in
    // a real browser, which always has `btoa`/`TextEncoder` and takes the
    // other branch.
    define: { "process.env.NODE_ENV": '"production"' },
    minify: true,
  });
  const output = result.outputFiles?.[0]?.text;
  if (!output) {
    throw new Error("esbuild produced no output for the demo-play client bundle");
  }
  cachedBundle = output;
  return cachedBundle;
}

function renderHtml(config: DemoPlayConfig): string {
  const clientConfig = JSON.stringify({
    resourceUrl: config.resourceUrl,
    faucetUrl: "/demo/play/faucet",
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Periplo — pay a real x402 request, no wallet needed</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 3rem auto; padding: 0 1.25rem; line-height: 1.5; }
  h1 { font-size: 1.4rem; }
  p.lede { opacity: 0.8; }
  button { font-size: 1.05rem; padding: 0.7rem 1.4rem; border-radius: 0.5rem; border: 1px solid #8888; cursor: pointer; background: #2d6cdf; color: white; }
  button:disabled { opacity: 0.6; cursor: default; }
  ul#steps { list-style: none; padding: 0; margin: 1rem 0; }
  ul#steps li { padding: 0.25rem 0; opacity: 0.8; }
  ul#steps li::before { content: "→ "; }
  #result, #error { margin-top: 1rem; padding: 1rem; border-radius: 0.5rem; }
  #result { background: #1a7f371a; border: 1px solid #1a7f3755; }
  #error { background: #d32f2f1a; border: 1px solid #d32f2f55; }
  code { word-break: break-all; }
  a { color: inherit; }
</style>
</head>
<body>
  <h1>Pay a real x402 request. No wallet. No setup.</h1>
  <p class="lede">
    Click the button. A one-time Stellar key is generated in your browser,
    funded on testnet, and used to pay a real, live endpoint that converts
    a temperature. You'll see a real settled transaction, checkable on
    Horizon, in about 15 seconds.
  </p>
  <button id="pay-button">Pay and convert</button>
  <div id="status" hidden>
    <ul id="steps"></ul>
  </div>
  <div id="result" hidden></div>
  <div id="error" hidden></div>
  <script>window.__PERIPLO_DEMO_PLAY_CONFIG__ = ${clientConfig};</script>
  <script type="module" src="/demo/play/client.js"></script>
</body>
</html>`;
}

export function mountDemoPlay(app: Hono, config: DemoPlayConfig): void {
  app.get("/demo/play", (c) => c.html(renderHtml(config)));

  app.get("/demo/play/client.js", async (c) => {
    const script = await getBundledClientScript();
    c.header("content-type", "text/javascript; charset=utf-8");
    // The bundle is deterministic for the life of this process (built
    // once, cached); safe for the browser to cache too, but revalidate
    // rather than trust it forever in case of a redeploy.
    c.header("cache-control", "public, max-age=300");
    return c.body(script);
  });

  app.post("/demo/play/faucet", async (c: Context) => {
    let json: unknown;
    try {
      json = await c.req.json();
    } catch {
      c.status(400);
      return c.json({ error: "invalid_request_body_not_json" });
    }
    const publicKey = (json as { publicKey?: unknown })?.publicKey;
    if (typeof publicKey !== "string" || !publicKey.startsWith("G")) {
      c.status(400);
      return c.json({ error: "publicKey missing or malformed" });
    }
    try {
      const prepared = await prepareFaucetTransaction(publicKey, {
        faucetSecret: config.faucetSecret,
        assetCode: config.assetCode,
        assetIssuer: config.assetIssuer,
        grantAmount: config.grantAmount ?? "1",
      });
      return c.json(prepared);
    } catch (error) {
      c.status(502);
      return c.json({
        error: "faucet_preparation_failed",
        detail: (error as Error).message,
      });
    }
  });
}
