import type { Dictionary } from "@/i18n/dictionaries";
import { format as fill } from "@/i18n/dictionaries";
import { formatAmount } from "./amount";

function percentOf(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return Number((part * 10_000n) / whole) / 100;
}

export function AuthorizedVsCharged({
  t,
  authorized,
  charged,
  refundLabel,
  unit,
  format = formatAmount,
}: {
  readonly t: Dictionary["demo"];
  readonly authorized: bigint;
  readonly charged: bigint;
  readonly refundLabel?: string;
  readonly unit: string;
  readonly format?: (units: bigint) => string;
}) {
  const chargedPercent = percentOf(charged, authorized);

  return (
    <div className="avc">
      <div className="avc__bar" aria-hidden="true">
        <div className="avc__charged" style={{ width: `${chargedPercent}%` }} />
      </div>
      <dl className="avc__legend">
        <div>
          <dt>
            <span className="swatch swatch--authorized" aria-hidden="true" />
            {t.authorized}
          </dt>
          <dd>
            {format(authorized)} {unit}
          </dd>
        </div>
        <div className="avc__highlight">
          <dt>
            <span className="swatch swatch--charged" aria-hidden="true" />
            {t.charged}
          </dt>
          <dd>
            {format(charged)} {unit}{" "}
            <span className="avc__percent">
              ({fill(t.ofCeiling, { percent: Math.floor(chargedPercent) })})
            </span>
          </dd>
        </div>
        <div>
          <dt>
            <span className="swatch swatch--refunded" aria-hidden="true" />
            {refundLabel ?? t.refunded}
          </dt>
          <dd>
            {format(authorized - charged)} {unit}
          </dd>
        </div>
      </dl>
    </div>
  );
}
