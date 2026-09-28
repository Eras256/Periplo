import type { ChainSettlement } from "./chain-settlements";
import { USDC_CONTRACT_ID } from "./contract";

/** The one real USDC settlement the simulator points at (verified on Horizon: successful, ledger 4906905). */
export const REFERENCE_SETTLEMENT_HASH =
  "d554adfb8f41efca8a5c14d7c82ded1330d3819bddd610ead51ab78257c5cafb";

/** The reference settlement as read from on-chain events, or `undefined` when it is not in the list. */
export function findReference(
  settlements: readonly ChainSettlement[] | null
): ChainSettlement | undefined {
  return settlements?.find(
    (settlement) =>
      settlement.transactionHash === REFERENCE_SETTLEMENT_HASH &&
      settlement.asset === USDC_CONTRACT_ID
  );
}
