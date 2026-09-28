import { formatAmount } from "../api/amount.js";
import { ASSET_CODE } from "../api/contract.js";

function percentOf(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return Number((part * 10_000n) / whole) / 100;
}

export function AuthorizedVsCharged({
  authorized,
  charged,
  refundLabel = "Devuelto al comprador",
  unit = ASSET_CODE,
  format = formatAmount,
}: {
  readonly authorized: bigint;
  readonly charged: bigint;
  readonly refundLabel?: string;
  readonly unit?: string;
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
            Autorizado (techo firmado)
          </dt>
          <dd>
            {format(authorized)} {unit}
          </dd>
        </div>
        <div className="avc__highlight">
          <dt>
            <span className="swatch swatch--charged" aria-hidden="true" />
            Cobrado de verdad
          </dt>
          <dd>
            {format(charged)} {unit}{" "}
            <span className="avc__percent">({Math.floor(chargedPercent)}% del techo)</span>
          </dd>
        </div>
        <div>
          <dt>
            <span className="swatch swatch--refunded" aria-hidden="true" />
            {refundLabel}
          </dt>
          <dd>
            {format(authorized - charged)} {unit}
          </dd>
        </div>
      </dl>
    </div>
  );
}
