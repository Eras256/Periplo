import {
  Account,
  Address,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { authorizationScVal, DemoSettleError, loadConfig, tagFromEnvelope } from "./settle";

const buyer = Keypair.random();
const submitter = Keypair.random();
const seller = Keypair.random().publicKey();
const CONTRACT = "CA7OYVXWPSQHXNBWJQZ7TCKQILAVBHWDAPNRJTKY66LHR5K5LFXRV6TW";
const USDC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

function fields(nonce: Buffer) {
  return {
    from: buyer.publicKey(),
    to: seller,
    asset: USDC,
    maxAmount: 1_000_000n,
    validAfterLedger: 100,
    deadlineLedger: 140,
    nonce,
    facilitator: submitter.publicKey(),
  };
}

describe("authorizationScVal", () => {
  it("builds the contract's struct as a map with symbol keys in sorted order, which Soroban requires", () => {
    const map = authorizationScVal(fields(Buffer.alloc(32, 7))).map() ?? [];
    const keys = map.map((entry) => entry.key().sym().toString());
    expect(keys).toEqual([
      "asset",
      "deadline_ledger",
      "facilitator",
      "from",
      "max_amount",
      "nonce",
      "to",
      "valid_after_ledger",
    ]);
    expect([...keys].sort()).toEqual(keys);
  });
});

describe("tagFromEnvelope", () => {
  it("reads the visitor tag back out of a settle transaction's signed nonce", () => {
    const tag = "ab12";
    const nonce = Buffer.concat([Buffer.from(tag, "hex"), Buffer.alloc(30, 9)]);
    const tx = new TransactionBuilder(new Account(submitter.publicKey(), "1"), {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.invokeHostFunction({
          func: xdr.HostFunction.hostFunctionTypeInvokeContract(
            new xdr.InvokeContractArgs({
              contractAddress: new Address(CONTRACT).toScAddress(),
              functionName: "settle",
              args: [authorizationScVal(fields(nonce)), xdr.ScVal.scvVoid()],
            })
          ),
          auth: [],
        })
      )
      .setTimeout(60)
      .build();
    tx.sign(submitter);
    expect(tagFromEnvelope(tx.toEnvelope().toXDR("base64"))).toBe(tag);
  });

  it("returns null for anything that is not a settle transaction", () => {
    expect(tagFromEnvelope("not xdr")).toBeNull();
  });
});

describe("loadConfig", () => {
  it("loads three accounts from the environment", () => {
    const config = loadConfig({
      DEMO_BUYER_SECRET: buyer.secret(),
      DEMO_SUBMITTER_SECRET: submitter.secret(),
      DEMO_SELLER_PUBLIC: seller,
    });
    expect(config.buyer.publicKey()).toBe(buyer.publicKey());
    expect(config.submitter.publicKey()).toBe(submitter.publicKey());
  });

  it("fails with a non-revealing error that never echoes a secret", () => {
    const env = {
      DEMO_BUYER_SECRET: buyer.secret(),
      DEMO_SUBMITTER_SECRET: "not-a-secret",
      DEMO_SELLER_PUBLIC: seller,
    };
    try {
      loadConfig(env);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DemoSettleError);
      const text = JSON.stringify({ message: (error as Error).message, ...(error as object) });
      expect(text).not.toContain(buyer.secret());
      expect(text).not.toContain("not-a-secret");
    }
    expect(() => loadConfig({})).toThrow(DemoSettleError);
  });
});
