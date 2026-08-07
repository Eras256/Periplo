import { describe, expect, it } from "vitest";
import { type AccountLoader, assertNonCustodialSigner, CustodialKeyError } from "./boot-safety.js";

describe("assertNonCustodialSigner", () => {
  it("allows an account holding only native XLM", async () => {
    const loadAccount: AccountLoader = async () => ({
      balances: [{ asset_type: "native" }],
    });
    await expect(
      assertNonCustodialSigner("G...", "stellar:testnet", loadAccount)
    ).resolves.toBeUndefined();
  });

  it("refuses to boot when the account holds a SEP-41 / classic asset balance", async () => {
    const loadAccount: AccountLoader = async () => ({
      balances: [
        { asset_type: "native" },
        { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: "GISSUER" },
      ],
    });
    await expect(assertNonCustodialSigner("G...", "stellar:testnet", loadAccount)).rejects.toThrow(
      CustodialKeyError
    );
  });

  it("includes the offending asset in the rejection message", async () => {
    const loadAccount: AccountLoader = async () => ({
      balances: [{ asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: "GISSUER" }],
    });
    await expect(assertNonCustodialSigner("G...", "stellar:testnet", loadAccount)).rejects.toThrow(
      /USDC:GISSUER/
    );
  });

  it("refuses to boot when the account can't be read at all", async () => {
    const loadAccount: AccountLoader = async () => {
      throw new Error("account not found");
    };
    await expect(assertNonCustodialSigner("G...", "stellar:testnet", loadAccount)).rejects.toThrow(
      CustodialKeyError
    );
  });

  it("allows an account with zero balances (edge case, shouldn't happen on a real network but must not crash)", async () => {
    const loadAccount: AccountLoader = async () => ({ balances: [] });
    await expect(
      assertNonCustodialSigner("G...", "stellar:testnet", loadAccount)
    ).resolves.toBeUndefined();
  });

  it("flags multiple non-native balances together, not just the first", async () => {
    const loadAccount: AccountLoader = async () => ({
      balances: [
        { asset_type: "native" },
        { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: "GISSUER1" },
        { asset_type: "credit_alphanum12", asset_code: "LONGCODE", asset_issuer: "GISSUER2" },
      ],
    });
    const rejection = assertNonCustodialSigner("G...", "stellar:testnet", loadAccount);
    await expect(rejection).rejects.toThrow(/USDC:GISSUER1/);
    await expect(rejection.catch((error: Error) => error.message)).resolves.toMatch(
      /LONGCODE:GISSUER2/
    );
  });
});
