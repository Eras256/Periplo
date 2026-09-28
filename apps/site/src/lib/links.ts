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
export const NPM_URL = "https://www.npmjs.com/package/periplo";
/** Open, not merged (checked against the GitHub API on every publish that cites it). */
export const UPTO_SPEC_PR_URL = "https://github.com/x402-foundation/x402/pull/3098";
export const SITE_URL = "https://periplo.xyz";
/** GitHub private vulnerability reporting (enabled on Eras256/Periplo, checked 2026-09-27). */
export const SECURITY_ADVISORY_URL = `${REPO_URL}/security/advisories/new`;

const EXPLORER = "https://stellar.expert/explorer/testnet";
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const accountUrl = (id: string) => `${EXPLORER}/account/${id}`;
export const contractUrl = (id: string) => `${EXPLORER}/contract/${id}`;
