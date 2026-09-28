export const UPTO_CONTRACT_ID = "CA7OYVXWPSQHXNBWJQZ7TCKQILAVBHWDAPNRJTKY66LHR5K5LFXRV6TW";
/** Ledger of the `CreateContract` transaction (2b8084b4bc...); no events can predate it. */
export const UPTO_CONTRACT_DEPLOY_LEDGER = 4905262;
export const ASSET_CODE = "PTEST";
export const ASSET_CONTRACT_ID = "CCK2UCUDA2CYGBHIPURM6TIXZEHULBVIGPVB2UTP3R2LCIKB3O5P723X";

const EXPLORER = "https://stellar.expert/explorer/testnet";
export const contractUrl = (id: string) => `${EXPLORER}/contract/${id}`;
export const accountUrl = (id: string) => `${EXPLORER}/account/${id}`;
export const transactionUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
