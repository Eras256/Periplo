/**
 * Runs entirely in the visitor's browser (bundled by `demo-play.ts`'s
 * `buildDemoPlayBundle`, esbuild, browser target). The exact flow this
 * module implements was verified from Node first, against the real live
 * deployment, before this file was written:
 * `apps/facilitator/scripts/demo-play-full-verify.ts` runs the identical
 * sequence — if that script ever stops working, this page will too, and
 * that script is the place to debug first, not the DOM code below.
 *
 * No wallet, no pre-funded account, no prior x402 knowledge needed from
 * the visitor: a one-time Ed25519 keypair is generated in the browser
 * (never sent anywhere), funded with testnet XLM via friendbot, given a
 * trustline and a small `PTEST` balance via this facilitator's own
 * `/demo/play/faucet` endpoint (which returns a transaction already
 * signed by the faucet account; this code adds the ephemeral key's own
 * signature and submits directly to Horizon — the ephemeral secret never
 * leaves this browser tab), then used to actually sign and settle a real
 * x402 payment against `/demo/temperature-convert`.
 *
 * Wire format used here (`PAYMENT-SIGNATURE` request header,
 * `PAYMENT-REQUIRED`/`PAYMENT-RESPONSE` response headers, all
 * base64(JSON.stringify(...))) was read directly from the installed
 * `@x402/core@2.22.0`'s own compiled source before writing this, not
 * assumed: x402 v2 uses `PAYMENT-SIGNATURE`, not `X-PAYMENT` (that's the
 * v1 fallback this project doesn't use).
 */

import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme as ExactStellarClientScheme } from "@x402/stellar/exact/client";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const FRIENDBOT_URL = "https://friendbot.stellar.org";

export interface DemoPlayStep {
  readonly label: string;
  readonly detail?: string;
}

export interface DemoPlaySuccess {
  readonly payerPublicKey: string;
  readonly conversion: { value: number; from: string; to: string; result: number };
  readonly transactionHash: string;
}

/** Thrown with a short, visitor-facing message; the page shows `.message` directly, never a raw JSON dump. */
export class DemoPlayError extends Error {}

function base64Encode(json: string): string {
  const bytes = new TextEncoder().encode(json);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary);
}

function base64Decode(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

interface PaymentRequirementsLike {
  readonly scheme: string;
  readonly network: string;
  readonly asset: string;
  readonly amount: string;
  readonly payTo: string;
  readonly maxTimeoutSeconds: number;
  readonly extra: { readonly areFeesSponsored: boolean };
}

export interface RunDemoPlayOptions {
  readonly resourceUrl: string;
  readonly faucetUrl: string;
  readonly onStep: (step: DemoPlayStep) => void;
}

/**
 * The whole click-to-pay flow. Every network call is real; nothing here
 * is simulated. Throws `DemoPlayError` with a short, human message on
 * any real-world failure (friendbot down, facilitator unreachable,
 * payment rejected) so the caller never has to show a raw stack trace or
 * JSON body to a visitor.
 */
export async function runDemoPlay(options: RunDemoPlayOptions): Promise<DemoPlaySuccess> {
  const { resourceUrl, faucetUrl, onStep } = options;

  onStep({ label: "Generating a one-time Stellar key in your browser" });
  const ephemeral = Keypair.random();

  onStep({
    label: "Funding it with testnet XLM",
    detail: "via Stellar's public friendbot faucet",
  });
  let friendbotRes: Response;
  try {
    friendbotRes = await fetch(`${FRIENDBOT_URL}/?addr=${ephemeral.publicKey()}`);
  } catch {
    throw new DemoPlayError(
      "Couldn't reach the testnet faucet. Check your connection and try again."
    );
  }
  if (!friendbotRes.ok) {
    throw new DemoPlayError(
      "The testnet faucet is temporarily unavailable. Try again in a moment."
    );
  }

  onStep({
    label: "Getting a small test-token balance",
    detail: "so your key can actually pay for something",
  });
  let faucetRes: Response;
  try {
    faucetRes = await fetch(faucetUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publicKey: ephemeral.publicKey() }),
    });
  } catch {
    throw new DemoPlayError("Couldn't reach the demo's own faucet. Try again in a moment.");
  }
  if (!faucetRes.ok) {
    throw new DemoPlayError(
      "Couldn't set up a test-token balance for your one-time key. Try again."
    );
  }
  const { transactionXdr, networkPassphrase } = (await faucetRes.json()) as {
    transactionXdr: string;
    networkPassphrase: string;
  };
  const onboardTx = TransactionBuilder.fromXDR(transactionXdr, networkPassphrase);
  onboardTx.sign(ephemeral);
  let onboardSubmitRes: Response;
  try {
    onboardSubmitRes = await fetch(`${HORIZON_URL}/transactions`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `tx=${encodeURIComponent(onboardTx.toXDR())}`,
    });
  } catch {
    throw new DemoPlayError("Couldn't reach the Stellar testnet network. Try again in a moment.");
  }
  if (!onboardSubmitRes.ok) {
    throw new DemoPlayError("Setting up your one-time key on testnet failed. Try again.");
  }

  onStep({ label: "Requesting the paid resource", detail: "expecting a real 402 challenge" });
  let firstRes: Response;
  try {
    firstRes = await fetch(resourceUrl);
  } catch {
    throw new DemoPlayError("Couldn't reach the demo resource. Try again in a moment.");
  }
  if (firstRes.status !== 402) {
    throw new DemoPlayError(`Expected a payment challenge (402), got ${firstRes.status}.`);
  }
  const paymentRequiredHeader = firstRes.headers.get("payment-required");
  if (!paymentRequiredHeader) {
    throw new DemoPlayError("The 402 response didn't include a payment challenge. Try again.");
  }
  const paymentRequired = JSON.parse(base64Decode(paymentRequiredHeader)) as {
    accepts: readonly PaymentRequirementsLike[];
  };
  const requirements = paymentRequired.accepts.find(
    (a) => a.scheme === "exact" && a.network === "stellar:testnet"
  );
  if (!requirements) {
    throw new DemoPlayError("The resource didn't offer a Stellar payment option this time.");
  }

  onStep({ label: "Signing the payment authorization", detail: "with your one-time key, locally" });
  const signer = createEd25519Signer(ephemeral.secret(), "stellar:testnet");
  const client = new ExactStellarClientScheme(signer);
  // biome-ignore lint/suspicious/noExplicitAny: the decoded 402 challenge matches @x402/core's real PaymentRequirements shape at runtime; the browser bundle deliberately avoids importing @x402/core/types just for this cast.
  const built = await client.createPaymentPayload(2, requirements as any);
  const paymentPayload = { ...built, accepted: requirements };
  const paymentSignatureHeader = base64Encode(JSON.stringify(paymentPayload));

  onStep({ label: "Submitting the paid request" });
  let secondRes: Response;
  try {
    secondRes = await fetch(resourceUrl, {
      headers: { "PAYMENT-SIGNATURE": paymentSignatureHeader },
    });
  } catch {
    throw new DemoPlayError("Couldn't reach the demo resource to submit payment. Try again.");
  }
  if (!secondRes.ok) {
    let reason = "";
    try {
      const errBody = (await secondRes.json()) as { error?: string; errorReason?: string };
      reason = errBody.error ?? errBody.errorReason ?? "";
    } catch {
      // body wasn't JSON; fall through with no extra detail
    }
    throw new DemoPlayError(reason ? `Payment failed: ${reason}` : "Payment failed. Try again.");
  }
  const conversion = (await secondRes.json()) as {
    value: number;
    from: string;
    to: string;
    result: number;
  };
  const paymentResponseHeader = secondRes.headers.get("payment-response");
  const settlement = paymentResponseHeader
    ? (JSON.parse(base64Decode(paymentResponseHeader)) as { transaction?: string })
    : null;
  if (!settlement?.transaction) {
    throw new DemoPlayError(
      "Payment succeeded but no settlement hash came back. That's unexpected."
    );
  }

  return {
    payerPublicKey: ephemeral.publicKey(),
    conversion,
    transactionHash: settlement.transaction,
  };
}
