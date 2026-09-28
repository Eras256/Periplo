"use client";

import { type FormEvent, useState } from "react";
import type { Locale } from "@/i18n/config";
import { type Dictionary, format } from "@/i18n/dictionaries";
import { AuthorizedVsCharged } from "./AuthorizedVsCharged";
import { formatAmount, parseAmount } from "./amount";
import { ASSET_CODE } from "./contract";
import { PRICE_PER_TOKEN, sumUsage } from "./simulation";
import { type SimulationPhase, useSimulation } from "./useSimulation";

function stepIndex(phase: SimulationPhase): number {
  return phase.step === "idle" ? 0 : phase.step === "metering" ? 1 : 2;
}

function CeilingForm({
  t,
  onAuthorize,
}: {
  readonly t: Dictionary["demo"]["sim"];
  readonly onAuthorize: (ceiling: bigint) => void;
}) {
  const [value, setValue] = useState("0.10");
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ceiling = parseAmount(value);
    if (ceiling === null || ceiling < PRICE_PER_TOKEN) {
      setError(format(t.invalid, { min: formatAmount(PRICE_PER_TOKEN) }));
      return;
    }
    setError(null);
    onAuthorize(ceiling);
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <label htmlFor="ceiling">{format(t.ceilingLabel, { asset: ASSET_CODE })}</label>
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
        <button type="submit" className="btn">
          {t.authorize}
        </button>
      </div>
      <p
        id="ceiling-hint"
        className={error ? "field-error" : "muted small"}
        role={error ? "alert" : undefined}
      >
        {error ?? t.hint}
      </p>
    </form>
  );
}

function Metering({
  locale,
  t,
  phase,
  onSettle,
}: {
  readonly locale: Locale;
  readonly t: Dictionary["demo"];
  readonly phase: Extract<SimulationPhase, { step: "metering" }>;
  readonly onSettle: () => void;
}) {
  const s = t.sim;
  const tokenFormat = new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US");
  const used = sumUsage(phase.events);
  const tokens = phase.events.reduce((sum, event) => sum + event.tokens, 0);

  return (
    <div className="stack">
      <p>
        {format(s.ceilingSummary, {
          ceiling: `${formatAmount(phase.ceiling)} ${ASSET_CODE}`,
          price: `${formatAmount(PRICE_PER_TOKEN)} ${ASSET_CODE}`,
        })}
      </p>
      <AuthorizedVsCharged t={t} authorized={phase.ceiling} charged={used} refundLabel={t.unused} />
      <p className="mono" aria-live="polite">
        {format(s.calls, { calls: phase.events.length, tokens: tokenFormat.format(tokens) })}
      </p>
      {phase.ceilingReached ? (
        <p className="notice" role="status">
          {s.reached}
        </p>
      ) : null}
      <ol className="usage" aria-label={s.listLabel}>
        {phase.events.length === 0 ? (
          <li className="muted">{s.waiting}</li>
        ) : (
          phase.events
            .slice(-8)
            .reverse()
            .map((event) => (
              <li key={event.id}>
                <span>
                  {format(s.call, { id: event.id, tokens: tokenFormat.format(event.tokens) })}
                </span>
                <span className="mono">
                  +{formatAmount(event.amount)} {ASSET_CODE}
                </span>
              </li>
            ))
        )}
      </ol>
      <button type="button" className="btn" onClick={onSettle} disabled={phase.events.length === 0}>
        {s.settle}
      </button>
    </div>
  );
}

export function Simulator({
  locale,
  t,
}: {
  readonly locale: Locale;
  readonly t: Dictionary["demo"];
}) {
  const { phase, authorize, settle, reset } = useSimulation();
  const current = stepIndex(phase);
  const s = t.sim;

  return (
    <section className="card" aria-labelledby="sim-title">
      <div className="card__head">
        <h2 id="sim-title">{s.title}</h2>
        <span className="tag tag--dashed">{s.tag}</span>
      </div>
      <p className="muted">{s.lede}</p>

      <ol className="stepper">
        {s.steps.map((label, index) => (
          <li
            key={label}
            className={index === current ? "is-current" : index < current ? "is-done" : undefined}
            aria-current={index === current ? "step" : undefined}
          >
            <span className="mono">{index + 1}</span> {label}
          </li>
        ))}
      </ol>

      {phase.step === "idle" ? <CeilingForm t={s} onAuthorize={authorize} /> : null}
      {phase.step === "metering" ? (
        <Metering locale={locale} t={t} phase={phase} onSettle={settle} />
      ) : null}
      {phase.step === "settled" ? (
        <div className="stack">
          <AuthorizedVsCharged t={t} authorized={phase.ceiling} charged={sumUsage(phase.events)} />
          <p className="muted small">{s.settledNote}</p>
          <button type="button" className="btn btn--secondary" onClick={reset}>
            {s.again}
          </button>
        </div>
      ) : null}
    </section>
  );
}
