import { describe, expect, it } from "vitest";
import { decodeSettledEvent } from "./settled-event";

// Real `Settled` event from CA7OYVXW...V6TW on stellar:testnet (ledger 4905350),
// tx cf33b51350f6e4c871b3f0a36e2151ad895dadbe2e237ef413259cf4a0533823, as
// returned by Soroban RPC `getEvents`.
const TOPICS = [
  "AAAADwAAAAdzZXR0bGVkAA==",
  "AAAAEgAAAAAAAAAANimR1sFuQ405wwV1QRV0NNVxh5vVZSagIRxtrsFTdEo=",
  "AAAAEgAAAAAAAAAAsZiOyozSKCcDod+uThm4/+BMlZQQdVQGYMMY6UfgyKI=",
];
const BODY =
  "AAAAEQAAAAEAAAAEAAAADwAAAA1hY3R1YWxfYW1vdW50AAAAAAAACgAAAAAAAAAAAAAAAAAHoSAAAAAPAAAABWFzc2V0AAAAAAAAEgAAAAGVqgqDBoWDBOh9Is9NF8kPRYaoM+odUm/cdLEhQdu6/wAAAA8AAAAKbWF4X2Ftb3VudAAAAAAACgAAAAAAAAAAAAAAAAAPQkAAAAAPAAAABW5vbmNlAAAAAAAADQAAACCHhxRKvq8v/o1gaiPYxqftgtjNltpmQuf2cGRpahNflA==";

describe("decodeSettledEvent", () => {
  it("decodes the real testnet event, strkeys cross-checked against stellar.expert", () => {
    expect(decodeSettledEvent(TOPICS, BODY)).toEqual({
      from: "GA3CTEOWYFXEHDJZYMCXKQIVOQ2NK4MHTPKWKJVAEEOG3LWBKN2EUSYP",
      to: "GCYZRDWKRTJCQJYDUHP24TQZXD76ATEVSQIHKVAGMDBRR2KH4DEKFY5T",
      asset: "CCK2UCUDA2CYGBHIPURM6TIXZEHULBVIGPVB2UTP3R2LCIKB3O5P723X",
      maxAmount: 1_000_000n,
      actualAmount: 500_000n,
    });
  });

  it("rejects events that are not `settled`", () => {
    const other = ["AAAADwAAAAVvdGhlcgAAAA==", TOPICS[1] ?? "", TOPICS[2] ?? ""];
    expect(decodeSettledEvent(other, BODY)).toBeNull();
    expect(decodeSettledEvent(TOPICS.slice(0, 2), BODY)).toBeNull();
  });

  it("returns null for malformed or truncated bodies", () => {
    expect(decodeSettledEvent(TOPICS, "AAAADwAAAAdzZXR0bGVkAA==")).toBeNull();
    expect(decodeSettledEvent(TOPICS, "not base64 at all")).toBeNull();
    expect(decodeSettledEvent(TOPICS, "")).toBeNull();
    expect(decodeSettledEvent(TOPICS, btoa(atob(BODY).slice(0, 60)))).toBeNull();
    expect(decodeSettledEvent(TOPICS, btoa(`${atob(BODY)}\0\0\0\0`))).toBeNull();
  });
});
