"use client";

import { type FormEvent, useState } from "react";
import { EVIDENCE } from "@/data/evidence";
import type { Locale } from "@/i18n/config";
import { type Dictionary, format } from "@/i18n/dictionaries";
import { txUrl } from "@/lib/links";
import { AuthorizedVsCharged } from "./AuthorizedVsCharged";
import { formatAmount, parseAmount } from "./amount";
import type { ChainSettlement } from "./chain-settlements";
import { SIMULATION_ASSET_CODE } from "./contract";
import { findReference, REFERENCE_SETTLEMENT_HASH } from "./reference";
import { MAX_CEILING, MAX_TOKENS } from "./settle-model";
import { PRICE_PER_TOKEN, sumUsage } from "./simulation";
import { type RealSettlementPhase, useRealSettlement } from "./useRealSettlement";
import { type SimulationPhase, useSimulation } from "./useSimulation";

type ErrorKey = keyof Dictionary["demo"]["sim"]["real"]["errors"];

/** Request-validation codes share one message; anything the page does not know falls back to "failed". */
function errorKey(code: string): ErrorKey {
  if (
    code.startsWith("invalid_") ||
    code === "ceiling_out_of_range" ||
    code === "unsupported_network"
  ) {
    return "invalid";
  }
  return code in ERROR_KEYS ? (code as ErrorKey) : "failed";
}

const ERROR_KEYS: Readonly<Record<ErrorKey, true>> = {
  rate_limited_visitor: true,
  rate_limited_global: true,
  demo_unavailable: true,
  demo_unfunded: true,
  busy: true,
  unconfirmed: true,
  failed: true,
  network: true,
  invalid: true,
};

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
    if (ceiling === null || ceiling < PRICE_PER_TOKEN || ceiling > MAX_CEILING) {
      setError(
        format(t.invalid, {
          min: formatAmount(PRICE_PER_TOKEN),
          max: formatAmount(MAX_CEILING),
        })
      );
      return;
    }
    setError(null);
    onAuthorize(ceiling);
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <label htmlFor="ceiling">{format(t.ceilingLabel, { asset: SIMULATION_ASSET_CODE })}</label>
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
  real,
  onSettle,
  onSettleReal,
}: {
  readonly locale: Locale;
  readonly t: Dictionary["demo"];
  readonly phase: Extract<SimulationPhase, { step: "metering" }>;
  readonly real: RealSettlementPhase;
  readonly onSettle: () => void;
  readonly onSettleReal: (tokens: number) => void;
}) {
  const s = t.sim;
  const tokenFormat = new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US");
  const used = sumUsage(phase.events);
  const tokens = phase.events.reduce((sum, event) => sum + event.tokens, 0);
  const [tokensText, setTokensText] = useState<string | null>(null);
  const shownTokens = tokensText ?? String(tokens);
  const declared = /^\d{1,7}$/.test(shownTokens) ? Number(shownTokens) : null;
  const tokensValid = declared !== null && declared <= MAX_TOKENS;
  const pending = real.status === "pending";
  const ceilingTokens = Number(phase.ceiling / PRICE_PER_TOKEN);

  return (
    <div className="stack">
      <p>
        {format(s.ceilingSummary, {
          ceiling: `${formatAmount(phase.ceiling)} ${SIMULATION_ASSET_CODE}`,
          price: `${formatAmount(PRICE_PER_TOKEN)} ${SIMULATION_ASSET_CODE}`,
        })}
      </p>
      <AuthorizedVsCharged
        t={t}
        authorized={phase.ceiling}
        charged={used}
        refundLabel={t.unused}
        unit={SIMULATION_ASSET_CODE}
      />
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
                  +{formatAmount(event.amount)} {SIMULATION_ASSET_CODE}
                </span>
              </li>
            ))
        )}
      </ol>
      <fieldset className="stack real" disabled={pending}>
        <legend>{s.real.title}</legend>
        <p className="notice">{s.real.disclosure}</p>
        <label htmlFor="tokens-used">{s.real.tokensLabel}</label>
        <input
          id="tokens-used"
          inputMode="numeric"
          autoComplete="off"
          value={shownTokens}
          onFocus={() => setTokensText((current) => current ?? shownTokens)}
          onChange={(event) => setTokensText(event.target.value)}
          aria-invalid={!tokensValid}
          aria-describedby="tokens-hint"
        />
        <div className="row">
          {(
            [
              [s.real.presets.zero, 0],
              [s.real.presets.exact, ceilingTokens],
              [s.real.presets.above, ceilingTokens * 2],
            ] as const
          ).map(([label, value]) => (
            <button
              key={label}
              type="button"
              className="btn btn--ghost"
              onClick={() => setTokensText(String(value))}
            >
              {label}
            </button>
          ))}
        </div>
        <p id="tokens-hint" className="muted small">
          {format(s.real.tokensHint, {
            price: `${formatAmount(PRICE_PER_TOKEN)} ${SIMULATION_ASSET_CODE}`,
          })}
        </p>
        <button
          type="button"
          className="btn"
          disabled={!tokensValid}
          onClick={() => declared !== null && onSettleReal(declared)}
        >
          {s.real.button}
        </button>
        {pending ? (
          <p className="notice" role="status">
            {s.real.pending}
          </p>
        ) : null}
      </fieldset>
      <button
        type="button"
        className="btn btn--secondary"
        onClick={onSettle}
        disabled={phase.events.length === 0 || pending}
      >
        {s.settle}
      </button>
    </div>
  );
}

function ReferenceSettlement({
  locale,
  t,
  settlements,
}: {
  readonly locale: Locale;
  readonly t: Dictionary["demo"];
  readonly settlements: readonly ChainSettlement[] | null;
}) {
  const r = t.sim.reference;
  const live = findReference(settlements);
  const evidence = EVIDENCE.find((item) => item.hash === REFERENCE_SETTLEMENT_HASH);

  return (
    <aside className="reference" aria-labelledby="reference-title">
      <h3 id="reference-title">{r.title}</h3>
      <p className="muted small">{r.lede}</p>
      {live ? (
        <>
          <AuthorizedVsCharged
            t={t}
            authorized={live.maxAmount}
            charged={live.actualAmount}
            unit={SIMULATION_ASSET_CODE}
          />
          <p className="muted small">{r.fromEvents}</p>
        </>
      ) : (
        <>
          <p>{evidence?.text[locale]}</p>
          <p className="muted small">{r.fromEvidence}</p>
        </>
      )}
      <p className="small">
        {r.transaction}:{" "}
        <a
          className="mono hash"
          href={txUrl(REFERENCE_SETTLEMENT_HASH)}
          target="_blank"
          rel="noreferrer"
        >
          {REFERENCE_SETTLEMENT_HASH}
        </a>
      </p>
    </aside>
  );
}

function RealResult({
  t,
  result,
}: {
  readonly t: Dictionary["demo"];
  readonly result: Extract<RealSettlementPhase, { status: "settled" }>["result"];
}) {
  const r = t.sim.real;
  const actual = BigInt(result.settled.actualAmount);
  return (
    <div className="stack" aria-live="polite" data-testid="real-result">
      <h3>{r.settledTitle}</h3>
      <AuthorizedVsCharged
        t={t}
        authorized={BigInt(result.settled.maxAmount)}
        charged={actual}
        unit={SIMULATION_ASSET_CODE}
      />
      <p className="muted small">{r.amountFromEvent}</p>
      {result.capped ? (
        <p className="notice" role="status">
          {format(r.capped, {
            cost: formatAmount(BigInt(result.cost)),
            asset: SIMULATION_ASSET_CODE,
          })}
        </p>
      ) : null}
      {actual === 0n ? <p className="notice">{r.zero}</p> : null}
      <p className="small">
        {r.transaction}:{" "}
        <a
          className="mono hash"
          data-testid="real-hash"
          href={txUrl(result.hash)}
          target="_blank"
          rel="noreferrer"
        >
          {result.hash}
        </a>
      </p>
      <p className="muted small">{r.disclosure}</p>
    </div>
  );
}

export function Simulator({
  locale,
  t,
  settlements,
}: {
  readonly locale: Locale;
  readonly t: Dictionary["demo"];
  readonly settlements: readonly ChainSettlement[] | null;
}) {
  const { phase, authorize, settle, reset } = useSimulation();
  const real = useRealSettlement();
  const current = stepIndex(phase);

  const settleReal = async (ceiling: bigint, tokens: number) => {
    await real.settle(ceiling, tokens);
    settle();
  };
  const restart = () => {
    real.reset();
    reset();
  };
  const s = t.sim;

  return (
    <section className="card" aria-labelledby="sim-title">
      <div className="card__head">
        <h2 id="sim-title">{s.title}</h2>
        <span className="tag tag--dashed tag--wrap">{s.tag}</span>
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
        <Metering
          locale={locale}
          t={t}
          phase={phase}
          real={real.phase}
          onSettle={settle}
          onSettleReal={(tokens) => void settleReal(phase.ceiling, tokens)}
        />
      ) : null}
      {phase.step === "settled" ? (
        <div className="stack">
          {real.phase.status === "settled" ? (
            <RealResult t={t} result={real.phase.result} />
          ) : (
            <>
              {real.phase.status === "failed" ? (
                <p className="notice" role="alert">
                  {s.real.errors[errorKey(real.phase.code)]} {s.real.fellBack}
                </p>
              ) : null}
              <AuthorizedVsCharged
                t={t}
                authorized={phase.ceiling}
                charged={sumUsage(phase.events)}
                unit={SIMULATION_ASSET_CODE}
              />
              <p className="muted small">{s.settledNote}</p>
              <ReferenceSettlement locale={locale} t={t} settlements={settlements} />
            </>
          )}
          <button type="button" className="btn btn--secondary" onClick={restart}>
            {s.again}
          </button>
        </div>
      ) : null}
    </section>
  );
}
