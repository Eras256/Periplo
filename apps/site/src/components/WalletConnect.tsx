"use client";

import { WalletButton } from "@pollar/react";

/**
 * Pollar's own batteries-included connect/account button (docs.pollar.xyz):
 * opens its login modal (Google, GitHub, email OTP) when not connected, and
 * shows the connected Stellar testnet address otherwise. Not wired to the
 * demo's settlement flow: that would change who signs the payment, out of
 * scope for tonight (docs/DEFERRED.md).
 */
export function WalletConnect() {
  return <WalletButton />;
}
