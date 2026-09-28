/** PTEST is a classic Stellar asset exposed through its SAC: 7 decimals, like every classic asset. */
export const ASSET_DECIMALS = 7;
const SCALE = 10n ** BigInt(ASSET_DECIMALS);

export function formatAmount(units: bigint, fractionDigits = ASSET_DECIMALS): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / SCALE;
  const fraction = (abs % SCALE).toString().padStart(ASSET_DECIMALS, "0");
  const shown = fraction
    .slice(0, fractionDigits)
    .replace(/0+$/, "")
    .padEnd(Math.min(2, fractionDigits), "0");
  return `${negative ? "-" : ""}${whole.toString()}${shown.length > 0 ? `.${shown}` : ""}`;
}

/** Parses a user-typed decimal ("0.1", "2", "0.0000001"); `null` for anything else, including more than 7 decimals. */
export function parseAmount(input: string): bigint | null {
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(input.trim());
  if (!match) return null;
  const [, whole = "0", fraction = ""] = match;
  if (fraction.length > ASSET_DECIMALS) return null;
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(ASSET_DECIMALS, "0"));
}
