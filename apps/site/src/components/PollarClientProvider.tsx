"use client";

import { PollarProvider } from "@pollar/react";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY;

/** `WalletConnect` reads this before calling `usePollar()`, which throws outside a `PollarProvider`. */
export const POLLAR_ENABLED = Boolean(PUBLISHABLE_KEY);

/** No-op wrapper when the publishable key isn't configured, so the rest of the site never depends on Pollar being set up. */
export function PollarClientProvider({ children }: { readonly children: React.ReactNode }) {
  if (!PUBLISHABLE_KEY) return <>{children}</>;
  return <PollarProvider client={{ apiKey: PUBLISHABLE_KEY }}>{children}</PollarProvider>;
}
