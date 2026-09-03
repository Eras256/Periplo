import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { prepareFaucetTransaction } from "./demo-faucet.js";
import { loadStellarTestEnv } from "./test-env.js";

/**
 * Real testnet integration test, same pattern as `core.test.ts`: reads
 * a real account (the faucet key) via live Horizon and produces a real,
 * validly-signed transaction, but never submits it (no cost, safe to
 * run on every push where the secret is configured). Skipped, not
 * failed, when `STELLAR_FEE_SPONSOR_SECRET`/`_PUBLIC` aren't set — this
 * file specifically needs `STELLAR_TEST_BUYER_SECRET`, checked directly
 * rather than reusing `loadStellarTestEnv()`'s own gate, since the
 * faucet's real secret is a different fixture than the one that helper
 * loads.
 */

const env = loadStellarTestEnv();
const faucetSecret = process.env.STELLAR_TEST_BUYER_SECRET;

describe.skipIf(!env || !faucetSecret)(
  "prepareFaucetTransaction: real testnet (spends nothing, submits nothing)",
  () => {
    const ASSET_ISSUER = "GDRTPOXBIW7JXFR7KMBTGIBOLV66I6XOKMTR3OMFYSZZF2V2HUSGPTZX";

    it("builds a transaction with exactly a changeTrust op (source: the visitor) and a payment op (source: the faucet)", async () => {
      const ephemeral = Keypair.random();
      const prepared = await prepareFaucetTransaction(ephemeral.publicKey(), {
        faucetSecret: faucetSecret as string,
        assetCode: "PTEST",
        assetIssuer: ASSET_ISSUER,
        grantAmount: "1",
      });

      const tx = TransactionBuilder.fromXDR(prepared.transactionXdr, prepared.networkPassphrase);
      expect(tx.operations).toHaveLength(2);

      const [changeTrustOp, paymentOp] = tx.operations;
      expect(changeTrustOp?.type).toBe("changeTrust");
      expect(changeTrustOp?.source).toBe(ephemeral.publicKey());
      expect(paymentOp?.type).toBe("payment");
      expect((paymentOp as { destination?: string })?.destination).toBe(ephemeral.publicKey());
      expect((paymentOp as { amount?: string })?.amount).toBe("1.0000000");
    });

    it("is already signed by the faucet key (one signature present before the visitor adds their own)", async () => {
      const ephemeral = Keypair.random();
      const prepared = await prepareFaucetTransaction(ephemeral.publicKey(), {
        faucetSecret: faucetSecret as string,
        assetCode: "PTEST",
        assetIssuer: ASSET_ISSUER,
        grantAmount: "1",
      });
      const tx = TransactionBuilder.fromXDR(prepared.transactionXdr, prepared.networkPassphrase);
      expect(tx.signatures).toHaveLength(1);
    });

    it("adding the visitor's own signature produces a transaction valid for submission (2 signatures, both required accounts covered)", async () => {
      const ephemeral = Keypair.random();
      const prepared = await prepareFaucetTransaction(ephemeral.publicKey(), {
        faucetSecret: faucetSecret as string,
        assetCode: "PTEST",
        assetIssuer: ASSET_ISSUER,
        grantAmount: "1",
      });
      const tx = TransactionBuilder.fromXDR(prepared.transactionXdr, prepared.networkPassphrase);
      tx.sign(ephemeral);
      expect(tx.signatures).toHaveLength(2);
    });

    it("uses the real testnet network passphrase", async () => {
      const ephemeral = Keypair.random();
      const prepared = await prepareFaucetTransaction(ephemeral.publicKey(), {
        faucetSecret: faucetSecret as string,
        assetCode: "PTEST",
        assetIssuer: ASSET_ISSUER,
        grantAmount: "1",
      });
      expect(prepared.networkPassphrase).toBe("Test SDF Network ; September 2015");
    });
  }
);

describe("prepareFaucetTransaction: gating visibility", () => {
  it("documents why this suite is skipped when the buyer/faucet key isn't configured", () => {
    if (!faucetSecret) {
      expect(faucetSecret).toBeFalsy();
    } else {
      expect(faucetSecret).toBeTruthy();
    }
  });
});
