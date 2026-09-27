import { useCallback, useEffect, useRef, useState } from "react";
import { startMetering, type UsageEvent } from "../api/simulation.js";

export type SimulationPhase =
  | { readonly step: "idle" }
  | {
      readonly step: "metering";
      readonly ceiling: bigint;
      readonly events: readonly UsageEvent[];
      readonly ceilingReached: boolean;
    }
  | { readonly step: "settled"; readonly ceiling: bigint; readonly events: readonly UsageEvent[] };

export function useSimulation() {
  const [phase, setPhase] = useState<SimulationPhase>({ step: "idle" });
  const stopRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const authorize = useCallback(
    (ceiling: bigint) => {
      stop();
      setPhase({ step: "metering", ceiling, events: [], ceilingReached: false });
      stopRef.current = startMetering({
        ceiling,
        onEvent: (event) =>
          setPhase((current) =>
            current.step === "metering"
              ? { ...current, events: [...current.events, event] }
              : current
          ),
        onCeilingReached: () =>
          setPhase((current) =>
            current.step === "metering" ? { ...current, ceilingReached: true } : current
          ),
      });
    },
    [stop]
  );

  const settle = useCallback(() => {
    stop();
    setPhase((current) =>
      current.step === "metering"
        ? { step: "settled", ceiling: current.ceiling, events: current.events }
        : current
    );
  }, [stop]);

  const reset = useCallback(() => {
    stop();
    setPhase({ step: "idle" });
  }, [stop]);

  return { phase, authorize, settle, reset };
}
