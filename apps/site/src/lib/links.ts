export const REPO_URL = "https://github.com/Eras256/Periplo";
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
export const README_URL = `${REPO_URL}#readme`;
export const DOCS = {
  sellers: `${REPO_URL}/blob/main/docs/SELLERS.md`,
  threatModel: `${REPO_URL}/blob/main/docs/THREAT-MODEL.md`,
  interop: `${REPO_URL}/blob/main/docs/INTEROP.md`,
  uptoConvergence: `${REPO_URL}/blob/main/docs/UPTO-CONVERGENCE.md`,
} as const;
export const FACILITATOR_URL = "https://periplo-testnet.fly.dev";
export const SITE_URL = "https://periplo.xyz";
/** Only works once private vulnerability reporting is enabled on the repo (it is not yet). */
export const SECURITY_ADVISORY_URL = `${REPO_URL}/security/advisories/new`;

const EXPLORER = "https://stellar.expert/explorer/testnet";
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const accountUrl = (id: string) => `${EXPLORER}/account/${id}`;
export const contractUrl = (id: string) => `${EXPLORER}/contract/${id}`;
