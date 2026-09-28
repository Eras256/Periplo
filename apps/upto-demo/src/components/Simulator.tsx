import { type FormEvent, useState } from "react";
import { formatAmount, parseAmount } from "../api/amount.js";
import { ASSET_CODE } from "../api/contract.js";
import { PRICE_PER_TOKEN, sumUsage } from "../api/simulation.js";
import { type SimulationPhase, useSimulation } from "../hooks/useSimulation.js";
import { AuthorizedVsCharged } from "./AuthorizedVsCharged.js";

const STEPS = ["Autorizar un techo", "Uso medido", "Liquidación"] as const;
const tokenFormat = new Intl.NumberFormat("es-MX");

function stepIndex(phase: SimulationPhase): number {
  return phase.step === "idle" ? 0 : phase.step === "metering" ? 1 : 2;
}

function CeilingForm({ onAuthorize }: { readonly onAuthorize: (ceiling: bigint) => void }) {
  const [value, setValue] = useState("0.10");
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ceiling = parseAmount(value);
    if (ceiling === null || ceiling < PRICE_PER_TOKEN) {
      setError(`Escribe un monto mayor a ${formatAmount(PRICE_PER_TOKEN)} con hasta 7 decimales.`);
      return;
    }
    setError(null);
    onAuthorize(ceiling);
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <label htmlFor="ceiling">Techo de gasto ({ASSET_CODE})</label>
      <div className="row">
        <input
          id="ceiling"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={error !== null}
          aria-describedby="ceiling-hint"
        />
        <button type="submit" className="button">
          Autorizar techo
        </button>
      </div>
      <p
        id="ceiling-hint"
        className={error ? "field-error" : "muted small"}
        role={error ? "alert" : undefined}
      >
        {error ??
          "El comprador firma este máximo una sola vez. En el flujo real es una firma de autorización sobre el contrato; aquí no se firma nada."}
      </p>
    </form>
  );
}

function Metering({
  phase,
  onSettle,
}: {
  readonly phase: Extract<SimulationPhase, { step: "metering" }>;
  readonly onSettle: () => void;
}) {
  const used = sumUsage(phase.events);
  const tokens = phase.events.reduce((sum, event) => sum + event.tokens, 0);

  return (
    <div className="stack">
      <p>
        Techo autorizado:{" "}
        <strong>
          {formatAmount(phase.ceiling)} {ASSET_CODE}
        </strong>
        . Tarifa simulada: {formatAmount(PRICE_PER_TOKEN)} {ASSET_CODE} por token generado.
      </p>
      <AuthorizedVsCharged
        authorized={phase.ceiling}
        charged={used}
        refundLabel="Sin usar (se devolvería)"
      />
      <p className="mono" aria-live="polite">
        {phase.events.length} llamadas · {tokenFormat.format(tokens)} tokens
      </p>
      {phase.ceilingReached ? (
        <p className="notice" role="status">
          Techo alcanzado: el servicio deja de atender llamadas. El contrato nunca permite cobrar
          más de lo firmado.
        </p>
      ) : null}
      <ol className="usage" aria-label="Llamadas medidas, la más reciente primero">
        {phase.events.length === 0 ? (
          <li className="muted">Esperando la primera llamada…</li>
        ) : (
          phase.events
            .slice(-8)
            .reverse()
            .map((event) => (
              <li key={event.id}>
                <span>
                  Llamada #{event.id} · {tokenFormat.format(event.tokens)} tokens
                </span>
                <span className="mono">
                  +{formatAmount(event.amount)} {ASSET_CODE}
                </span>
              </li>
            ))
        )}
      </ol>
      <button
        type="button"
        className="button"
        onClick={onSettle}
        disabled={phase.events.length === 0}
      >
        Terminar y liquidar solo lo usado
      </button>
    </div>
  );
}

export function Simulator() {
  const { phase, authorize, settle, reset } = useSimulation();
  const current = stepIndex(phase);

  return (
    <section className="card" aria-labelledby="sim-title">
      <div className="card__head">
        <h2 id="sim-title">Pruébalo tú</h2>
        <span className="tag tag--sim">Simulación en tu navegador</span>
      </div>
      <p className="muted">
        Recorre el mismo flujo con montos generados localmente. No envía transacciones ni toca
        testnet; las liquidaciones reales están en la sección de arriba.
      </p>

      <ol className="stepper">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={index === current ? "is-current" : index < current ? "is-done" : undefined}
            aria-current={index === current ? "step" : undefined}
          >
            <span className="stepper__n">{index + 1}</span> {label}
          </li>
        ))}
      </ol>

      {phase.step === "idle" ? <CeilingForm onAuthorize={authorize} /> : null}
      {phase.step === "metering" ? <Metering phase={phase} onSettle={settle} /> : null}
      {phase.step === "settled" ? (
        <div className="stack">
          <AuthorizedVsCharged authorized={phase.ceiling} charged={sumUsage(phase.events)} />
          <p className="muted small">
            Simulado: no se envió ninguna transacción. En testnet, este mismo resultado es una sola
            llamada a <code>settle</code> que transfiere lo cobrado al vendedor y devuelve el resto
            al comprador en la misma transacción.
          </p>
          <button type="button" className="button button--secondary" onClick={reset}>
            Probar de nuevo
          </button>
        </div>
      ) : null}
    </section>
  );
}
