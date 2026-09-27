import { describe, expect, it } from "vitest";
import { cursorLedger, toChainSettlement } from "./chain-settlements.js";

const REAL_EVENT = {
  id: "0021068317825462272-0000000003",
  ledgerClosedAt: "2026-09-27T23:05:37Z",
  txHash: "cf33b51350f6e4c871b3f0a36e2151ad895dadbe2e237ef413259cf4a0533823",
  inSuccessfulContractCall: true,
  topic: [
    "AAAADwAAAAdzZXR0bGVkAA==",
    "AAAAEgAAAAAAAAAANimR1sFuQ405wwV1QRV0NNVxh5vVZSagIRxtrsFTdEo=",
    "AAAAEgAAAAAAAAAAsZiOyozSKCcDod+uThm4/+BMlZQQdVQGYMMY6UfgyKI=",
  ],
  value:
    "AAAAEQAAAAEAAAAEAAAADwAAAA1hY3R1YWxfYW1vdW50AAAAAAAACgAAAAAAAAAAAAAAAAAHoSAAAAAPAAAABWFzc2V0AAAAAAAAEgAAAAGVqgqDBoWDBOh9Is9NF8kPRYaoM+odUm/cdLEhQdu6/wAAAA8AAAAKbWF4X2Ftb3VudAAAAAAACgAAAAAAAAAAAAAAAAAPQkAAAAAPAAAABW5vbmNlAAAAAAAADQAAACCHhxRKvq8v/o1gaiPYxqftgtjNltpmQuf2cGRpahNflA==",
};

describe("cursorLedger", () => {
  it("extracts the ledger from real RPC cursors", () => {
    expect(cursorLedger("0021070499668819967-4294967295")).toBe(4905857);
    expect(cursorLedger(REAL_EVENT.id)).toBe(4905350);
    expect(cursorLedger("garbage")).toBe(0);
  });
});

describe("toChainSettlement", () => {
  it("maps a real RPC event, keeping the transaction hash", () => {
    const settlement = toChainSettlement(REAL_EVENT);
    expect(settlement?.transactionHash).toBe(REAL_EVENT.txHash);
    expect(settlement?.settledAt.toISOString()).toBe("2026-09-27T23:05:37.000Z");
    expect(settlement?.actualAmount).toBe(500_000n);
  });

  it("drops events from failed contract calls", () => {
    expect(toChainSettlement({ ...REAL_EVENT, inSuccessfulContractCall: false })).toBeNull();
  });
});
