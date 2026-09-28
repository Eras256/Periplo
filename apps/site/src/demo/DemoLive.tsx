"use client";

import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { ChainSettlements } from "./ChainSettlements";
import { Simulator } from "./Simulator";
import { useChainSettlements } from "./useChainSettlements";

/** One on-chain read shared by the settlements list and the simulator's reference block. */
export function DemoLive({
  locale,
  t,
}: {
  readonly locale: Locale;
  readonly t: Dictionary["demo"];
}) {
  const live = useChainSettlements();
  return (
    <>
      <ChainSettlements locale={locale} t={t} live={live} />
      <Simulator locale={locale} t={t} settlements={live.settlements} />
    </>
  );
}
