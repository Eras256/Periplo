import type { ChainSettlement } from "../api/chain-settlements.js";
import { ASSET_CONTRACT_ID, transactionUrl } from "../api/contract.js";
import { POLL_INTERVAL_MS, useChainSettlements } from "../hooks/useChainSettlements.js";
import { Address, shorten } from "./Address.js";
import { AuthorizedVsCharged } from "./AuthorizedVsCharged.js";

const dateFormat = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });
const timeFormat = new Intl.DateTimeFormat("es-MX", { timeStyle: "medium" });

/** The contract accepts any SEP-41 token; only PTEST's decimals are known here, so others show raw base units. */
function amountProps(settlement: ChainSettlement) {
  if (settlement.asset === ASSET_CONTRACT_ID) return {};
  return {
    unit: `unidades base de ${shorten(settlement.asset)}`,
    format: (units: bigint) => units.toString(),
  };
}

export function ChainSettlements() {
  const { settlements, error, loading, updatedAt, reload } = useChainSettlements();

  return (
    <section className="card" aria-labelledby="chain-title" aria-busy={loading}>
      <div className="card__head">
        <h2 id="chain-title">Liquidaciones reales en testnet</h2>
        <span className="tag tag--real">Datos on-chain</span>
      </div>
      <p className="muted">
        Eventos <code>settled</code> del contrato, leídos directamente del RPC público de Soroban en
        testnet. La página vuelve a consultar cada {POLL_INTERVAL_MS / 1000} s mientras está visible
        (consulta periódica, no streaming). El RPC conserva unos 7 días de eventos.
      </p>

      {error ? (
        <div className="notice notice--error" role="alert">
          <p>
            {settlements
              ? `No se pudo actualizar: ${error} Se muestran los últimos datos obtenidos.`
              : `No se pudo leer testnet: ${error}`}
          </p>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => void reload()}
            disabled={loading}
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {settlements === null && loading ? <p className="muted">Consultando testnet…</p> : null}

      {settlements !== null && settlements.length === 0 ? (
        <p className="muted">
          Todavía no hay liquidaciones de este contrato dentro de la ventana que conserva el RPC.
        </p>
      ) : null}

      {settlements !== null && settlements.length > 0 ? (
        <ol className="settlements">
          {settlements.map((settlement) => (
            <li key={settlement.id} className="settlement">
              <div className="settlement__meta">
                <time dateTime={settlement.settledAt.toISOString()}>
                  {dateFormat.format(settlement.settledAt)}
                </time>
                <span>
                  Comprador <Address id={settlement.from} /> → vendedor{" "}
                  <Address id={settlement.to} />
                </span>
              </div>
              <AuthorizedVsCharged
                authorized={settlement.maxAmount}
                charged={settlement.actualAmount}
                {...amountProps(settlement)}
              />
              <p className="settlement__tx">
                Transacción:{" "}
                <a
                  className="mono"
                  href={transactionUrl(settlement.transactionHash)}
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
          Última consulta: {timeFormat.format(updatedAt)}
          {loading ? " (actualizando…)" : ""}
        </p>
      ) : null}
    </section>
  );
}
