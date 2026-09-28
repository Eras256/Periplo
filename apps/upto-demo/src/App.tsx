import { ASSET_CODE, ASSET_CONTRACT_ID, UPTO_CONTRACT_ID } from "./api/contract.js";
import { Address } from "./components/Address.js";
import { ChainSettlements } from "./components/ChainSettlements.js";
import { Simulator } from "./components/Simulator.js";

export function App() {
  return (
    <div className="page">
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>
      <header className="stack">
        <p className="eyebrow">Periplo · UptoSettlement</p>
        <h1>Autorizas un techo. Pagas solo lo que usas.</h1>
        <p className="lede">
          Con UptoSettlement, quien compra firma un monto máximo una sola vez. Después, el
          facilitador liquida en Stellar únicamente el uso real (tokens generados, segundos de
          acceso, filas devueltas) y el contrato devuelve el resto en la misma transacción.
        </p>
        <p className="badges">
          <span className="tag tag--network">Stellar testnet</span>
          <span className="tag">Activo de prueba: {ASSET_CODE}</span>
        </p>
      </header>

      <main id="main" className="stack stack--lg">
        <ChainSettlements />
        <Simulator />
      </main>

      <footer className="stack small muted">
        <dl className="facts">
          <div>
            <dt>Contrato UptoSettlement</dt>
            <dd>
              <Address id={UPTO_CONTRACT_ID} full />
            </dd>
          </div>
          <div>
            <dt>Activo ({ASSET_CODE})</dt>
            <dd>
              <Address id={ASSET_CONTRACT_ID} full />
            </dd>
          </div>
        </dl>
        <p>
          Todo en esta página ocurre en Stellar testnet. {ASSET_CODE} es un activo de prueba sin
          valor. Periplo no opera en mainnet todavía.
        </p>
        <p>
          <a href="https://github.com/Eras256/Periplo" target="_blank" rel="noreferrer">
            Código fuente (Apache-2.0)
          </a>
        </p>
      </footer>
    </div>
  );
}
