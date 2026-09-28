"use client";

import type { Locale } from "@/i18n/config";
import { type Dictionary, format } from "@/i18n/dictionaries";
import { accountUrl, contractUrl, txUrl } from "@/lib/links";
import { AuthorizedVsCharged } from "./AuthorizedVsCharged";
import type { ChainSettlement } from "./chain-settlements";
import { ASSET_CONTRACT_ID } from "./contract";
import {
  type ChainSettlementsState,
  POLL_INTERVAL_MS,
  useChainSettlements,
} from "./useChainSettlements";

export function shorten(id: string): string {
  return id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}

export function Address({ id, full = false }: { readonly id: string; readonly full?: boolean }) {
  return (
    <a
      className="mono"
      href={id.startsWith("C") ? contractUrl(id) : accountUrl(id)}
      target="_blank"
      rel="noreferrer"
      title={id}
    >
      {full ? id : shorten(id)}
    </a>
  );
}

function errorText(
  error: NonNullable<ChainSettlementsState["error"]>,
  t: Dictionary["demo"]["chain"]
): string {
  switch (error.code) {
    case "connect":
      return t.errConnect;
    case "status":
      return format(t.errStatus, { status: error.status });
    case "rejected":
      return format(t.errRejected, { method: error.method, detail: error.detail });
    default:
      return t.errUnknown;
  }
}

export function ChainSettlements({
  locale,
  t,
}: {
  readonly locale: Locale;
  readonly t: Dictionary["demo"];
}) {
  const { settlements, error, loading, updatedAt, reload } = useChainSettlements();
  const c = t.chain;
  const intl = locale === "es" ? "es-MX" : "en-US";
  const dateFormat = new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeStyle: "short" });
  const timeFormat = new Intl.DateTimeFormat(intl, { timeStyle: "medium" });

  const amountProps = (settlement: ChainSettlement) =>
    settlement.asset === ASSET_CONTRACT_ID
      ? {}
      : {
          unit: format(t.baseUnitsOf, { asset: shorten(settlement.asset) }),
          format: (units: bigint) => units.toString(),
        };

  return (
    <section className="card" aria-labelledby="chain-title" aria-busy={loading}>
      <div className="card__head">
        <h2 id="chain-title">{c.title}</h2>
        <span className="tag tag--accent">{c.tag}</span>
      </div>
      <p className="muted">{format(c.lede, { seconds: POLL_INTERVAL_MS / 1000 })}</p>

      {error ? (
        <div className="notice notice--error" role="alert">
          <p>
            {settlements
              ? format(c.errorWithData, { error: errorText(error, c) })
              : format(c.errorNoData, { error: errorText(error, c) })}
          </p>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => void reload()}
            disabled={loading}
          >
            {c.retry}
          </button>
        </div>
      ) : null}

      {settlements === null && loading ? <p className="muted">{c.loading}</p> : null}

      {settlements !== null && settlements.length === 0 ? <p className="muted">{c.empty}</p> : null}

      {settlements !== null && settlements.length > 0 ? (
        <ol className="settlements">
          {settlements.map((settlement) => (
            <li key={settlement.id} className="settlement">
              <div className="settlement__meta">
                <time dateTime={settlement.settledAt.toISOString()}>
                  {dateFormat.format(settlement.settledAt)}
                </time>
                <span>
                  {c.buyer} <Address id={settlement.from} /> → {c.seller}{" "}
                  <Address id={settlement.to} />
                </span>
              </div>
              <AuthorizedVsCharged
                t={t}
                authorized={settlement.maxAmount}
                charged={settlement.actualAmount}
                {...amountProps(settlement)}
              />
              <p className="small">
                {c.transaction}:{" "}
                <a
                  className="mono"
                  href={txUrl(settlement.transactionHash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shorten(settlement.transactionHash)}
                </a>
              </p>
            </li>
          ))}
        </ol>
      ) : null}

      {updatedAt ? (
        <p className="muted small">
          {c.lastChecked}: {timeFormat.format(updatedAt)}
          {loading ? ` (${c.updating})` : ""}
        </p>
      ) : null}
    </section>
  );
}
