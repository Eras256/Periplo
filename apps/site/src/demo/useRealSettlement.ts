import { useCallback, useRef, useState } from "react";
import {
  parseSettleResponse,
  type SettleErrorCode,
  type SettleSuccess,
  TESTNET_NETWORK,
} from "./settle-model";

export type RealSettlementPhase =
  | { readonly status: "idle" }
  | { readonly status: "pending" }
  | { readonly status: "settled"; readonly result: SettleSuccess }
  | { readonly status: "failed"; readonly code: SettleErrorCode | "network" };

const CLIENT_TIMEOUT_MS = 58_000;

/**
 * Asks the server to settle. The browser sends only the ceiling and the token
 * count; whatever amount or hash it displays comes from the server's answer, and
 * only when that answer has exactly the shape of a confirmed settlement.
 */
export function useRealSettlement() {
  const [phase, setPhase] = useState<RealSettlementPhase>({ status: "idle" });
  const inFlight = useRef(false);

  const settle = useCallback(async (ceiling: bigint, tokens: number): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setPhase({ status: "pending" });
    try {
      const response = await fetch("/api/demo/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ceiling: ceiling.toString(), tokens, network: TESTNET_NETWORK }),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      const parsed = parseSettleResponse(await response.json().catch(() => null));
      if (parsed?.status === "settled" && response.ok) {
        setPhase({ status: "settled", result: parsed });
        return true;
      }
      setPhase({ status: "failed", code: parsed?.status === "error" ? parsed.code : "failed" });
      return false;
    } catch {
      setPhase({ status: "failed", code: "network" });
      return false;
    } finally {
      inFlight.current = false;
    }
  }, []);

  const reset = useCallback(() => setPhase({ status: "idle" }), []);
  return { phase, settle, reset };
}
