export const UPTO_CONTRACT_ID = "CA7OYVXWPSQHXNBWJQZ7TCKQILAVBHWDAPNRJTKY66LHR5K5LFXRV6TW";
/** Ledger of the `CreateContract` transaction (2b8084b4bc...); no events can predate it. */
export const UPTO_CONTRACT_DEPLOY_LEDGER = 4905262;
export const ASSET_CODE = "PTEST";
export const ASSET_CONTRACT_ID = "CCK2UCUDA2CYGBHIPURM6TIXZEHULBVIGPVB2UTP3R2LCIKB3O5P723X";
export const USDC_CONTRACT_ID = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

/** Both are classic assets behind a SAC, so both have 7 decimals, which is what `formatAmount` assumes. */
const KNOWN_ASSET_CODES: Readonly<Record<string, string>> = {
  [ASSET_CONTRACT_ID]: ASSET_CODE,
  [USDC_CONTRACT_ID]: "USDC",
};

/** Label for an asset contract ID, or `undefined` when its decimals are not known here. */
export function knownAssetCode(assetContractId: string): string | undefined {
  return KNOWN_ASSET_CODES[assetContractId];
}
