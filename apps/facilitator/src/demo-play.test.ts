import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { mountDemoPlay } from "./demo-play.js";

/**
 * Route-level tests via Hono's in-memory `app.request()`, same pattern
 * as `app.test.ts`. `POST /demo/play/faucet`'s real success path (a real
 * Horizon call, a real signed transaction) is covered instead by
 * `demo-faucet.test.ts`'s gated integration suite and by
 * `scripts/demo-play-full-verify.ts`/`scripts/demo-play-browser-verify.mjs`,
 * which exercise it against real testnet; this file covers the request
 * validation and page-serving plumbing that doesn't need live network.
 */

function testApp(): Hono {
  const app = new Hono();
  mountDemoPlay(app, {
    resourceUrl: "https://periplo-testnet.fly.dev/demo/temperature-convert",
    faucetSecret: "SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAV767", // never dereferenced in these tests
    assetCode: "PTEST",
    assetIssuer: "GDRTPOXBIW7JXFR7KMBTGIBOLV66I6XOKMTR3OMFYSZZF2V2HUSGPTZX",
  });
  return app;
}

describe("GET /demo/play", () => {
  it("returns a real HTML page with the pay button and the client script tag", async () => {
    const app = testApp();
    const res = await app.request("/demo/play");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="pay-button"');
    expect(html).toContain('src="/demo/play/client.js"');
    expect(html).toContain("__PERIPLO_DEMO_PLAY_CONFIG__");
  });

  it("embeds the configured resource URL and faucet URL for the browser to read", async () => {
    const app = testApp();
    const res = await app.request("/demo/play");
    const html = await res.text();
    expect(html).toContain("https://periplo-testnet.fly.dev/demo/temperature-convert");
    expect(html).toContain("/demo/play/faucet");
  });
});

describe("GET /demo/play/client.js", () => {
  it("returns a real, non-empty, cacheable JS bundle", async () => {
    const app = testApp();
    const res = await app.request("/demo/play/client.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(res.headers.get("cache-control")).toContain("max-age");
    const body = await res.text();
    expect(body.length).toBeGreaterThan(1000);
  });

  it("bundles the same script on repeat requests (cached, not rebuilt every time)", async () => {
    const app = testApp();
    const res1 = await app.request("/demo/play/client.js");
    const body1 = await res1.text();
    const res2 = await app.request("/demo/play/client.js");
    const body2 = await res2.text();
    expect(body1).toBe(body2);
  });
});

describe("POST /demo/play/faucet", () => {
  it("rejects a non-JSON body with 400, before touching the network", async () => {
    const app = testApp();
    const res = await app.request("/demo/play/faucet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a missing publicKey with 400", async () => {
    const app = testApp();
    const res = await app.request("/demo/play/faucet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();
  });

  it("rejects a malformed publicKey (doesn't start with G) with 400, before touching the network", async () => {
    const app = testApp();
    const res = await app.request("/demo/play/faucet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publicKey: "not-a-real-key" }),
    });
    expect(res.status).toBe(400);
  });
});
