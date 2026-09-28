import { useCallback, useEffect, useRef, useState } from "react";
import { type ChainSettlement, fetchSettlementsSince } from "../api/chain-settlements.js";

export const POLL_INTERVAL_MS = 30_000;
const MAX_SHOWN = 10;

export interface ChainSettlementsState {
  /** Newest first. `null` until the first successful read. */
  readonly settlements: readonly ChainSettlement[] | null;
  readonly error: string | null;
  readonly loading: boolean;
  readonly updatedAt: Date | null;
}

export function useChainSettlements() {
  const [state, setState] = useState<ChainSettlementsState>({
    settlements: null,
    error: null,
    loading: true,
    updatedAt: null,
  });
  const cursorRef = useRef<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((current) => ({ ...current, loading: true }));
    try {
      const { settlements, cursor } = await fetchSettlementsSince(
        cursorRef.current,
        controller.signal
      );
      cursorRef.current = cursor;
      setState((current) => {
        const known = new Set(current.settlements?.map((s) => s.id));
        const fresh = settlements.filter((s) => !known.has(s.id)).reverse();
        return {
          settlements: [...fresh, ...(current.settlements ?? [])].slice(0, MAX_SHOWN),
          error: null,
          loading: false,
          updatedAt: new Date(),
        };
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "No se pudo leer testnet.",
      }));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [load]);

  return { ...state, reload: load };
}
