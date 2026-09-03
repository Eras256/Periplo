/**
 * DOM wiring for `/demo/play`. Deliberately thin: all real logic lives in
 * `demo-play-client.ts`'s `runDemoPlay`, tested and verified independent
 * of the DOM (`demo-play-full-verify.ts` runs the same flow from Node).
 * This file's only job is translating button clicks and `onStep`
 * callbacks into visible page state, and turning any `DemoPlayError`
 * into a plain-language message, never a raw stack trace or JSON body.
 */

import { DemoPlayError, runDemoPlay } from "./demo-play-client.js";

declare global {
  interface Window {
    __PERIPLO_DEMO_PLAY_CONFIG__?: { resourceUrl: string; faucetUrl: string };
  }
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

function main(): void {
  const button = byId<HTMLButtonElement>("pay-button");
  const statusEl = byId<HTMLDivElement>("status");
  const stepsEl = byId<HTMLUListElement>("steps");
  const resultEl = byId<HTMLDivElement>("result");
  const errorEl = byId<HTMLDivElement>("error");

  const config = window.__PERIPLO_DEMO_PLAY_CONFIG__;
  if (!config) {
    errorEl.textContent = "Demo configuration missing. Reload the page.";
    errorEl.hidden = false;
    button.disabled = true;
    return;
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    resultEl.hidden = true;
    errorEl.hidden = true;
    stepsEl.innerHTML = "";
    statusEl.hidden = false;

    try {
      const success = await runDemoPlay({
        resourceUrl: config.resourceUrl,
        faucetUrl: config.faucetUrl,
        onStep: (step) => {
          const li = document.createElement("li");
          li.textContent = step.detail ? `${step.label} — ${step.detail}` : step.label;
          stepsEl.appendChild(li);
        },
      });

      statusEl.hidden = true;
      resultEl.hidden = false;
      resultEl.innerHTML = `
        <p><strong>${success.conversion.value}° ${success.conversion.from}</strong> is
        <strong>${success.conversion.result}° ${success.conversion.to}</strong>.</p>
        <p>Paid by a key that existed for a few seconds:
          <code>${success.payerPublicKey}</code></p>
        <p>Real settled transaction:
          <a href="https://stellar.expert/explorer/testnet/tx/${success.transactionHash}"
             target="_blank" rel="noopener noreferrer">${success.transactionHash}</a>
        </p>
      `;
    } catch (error) {
      statusEl.hidden = true;
      errorEl.hidden = false;
      errorEl.textContent =
        error instanceof DemoPlayError
          ? error.message
          : "Something unexpected went wrong. Try again.";
      // Real errors still reach the browser console for anyone debugging,
      // just never shown raw to the visitor.
      console.error(error);
    } finally {
      button.disabled = false;
    }
  });
}

main();
