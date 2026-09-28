"use client";

import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import type { FacilitatorStatus } from "@/lib/facilitator-status";
import { FACILITATOR_URL, txUrl } from "@/lib/links";

type State =
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "ready"; readonly status: FacilitatorStatus };

function duration(seconds: number, t: Dictionary["status"]): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} ${t.days} ${hours} ${t.hours}`;
  if (hours > 0) return `${hours} ${t.hours} ${minutes} ${t.minutes}`;
  return `${minutes} ${t.minutes}`;
}

export function LiveStatus({
  locale,
  t,
}: {
  readonly locale: Locale;
  readonly t: Dictionary["status"];
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const intlLocale = locale === "es" ? "es-MX" : "en-US";

  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/facilitator", signal ? { signal } : {});
      const body = (await response.json()) as { ok: boolean; status?: FacilitatorStatus };
      setState(body.ok && body.status ? { kind: "ready", status: body.status } : { kind: "error" });
    } catch {
      if (!signal?.aborted) setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const number = new Intl.NumberFormat(intlLocale);
  const percent = new Intl.NumberFormat(intlLocale, { style: "percent", maximumFractionDigits: 2 });
  const time = new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeStyle: "medium" });

  return (
    <section id="status" className="section" aria-labelledby="status-title">
      <div className="container">
        <div className="section__head">
          <p className="eyebrow">03</p>
          <h2 id="status-title">{t.title}</h2>
          <p className="lede">
            {t.lede}{" "}
            <a
              href={`${FACILITATOR_URL}/supported`}
              target="_blank"
              rel="noreferrer"
              className="mono small"
            >
              periplo-testnet.fly.dev
            </a>
          </p>
        </div>

        <div className="card status" aria-live="polite" aria-busy={state.kind === "loading"}>
          {state.kind === "loading" ? (
            <>
              <p className="muted">{t.loading}</p>
              <div className="stats" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="stat">
                    <div className="skeleton" style={{ width: "60%" }} />
                    <div className="skeleton" style={{ width: "40%", marginTop: 8 }} />
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {state.kind === "error" ? (
            <div className="notice notice--error" role="alert">
              <p>{t.error}</p>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => void load()}
              >
                {t.retry}
              </button>
            </div>
          ) : null}

          {state.kind === "ready" ? (
            <>
              <div className="status__schemes">
                <span className="muted small">{t.schemes}:</span>
                {state.status.kinds.map((kind) => (
                  <span key={`${kind.scheme}-${kind.network}`} className="tag tag--accent">
                    <span className="dot" aria-hidden="true" />
                    {kind.scheme} · {kind.network}
                  </span>
                ))}
                {state.status.extensions.map((ext) => (
                  <span key={ext} className="tag">
                    {t.extensions}: {ext}
                  </span>
                ))}
              </div>
              {state.status.kinds.some((kind) => kind.scheme === "upto") ? null : (
                <p className="muted small">{t.uptoMissing}</p>
              )}
              <dl className="stats">
                <div className="stat">
                  <dt>{t.feePayers}</dt>
                  <dd>{state.status.feePayers}</dd>
                </div>
                {state.status.telemetry ? (
                  <>
                    <div className="stat">
                      <dt>{t.uptime}</dt>
                      <dd>{duration(state.status.telemetry.uptimeSeconds, t)}</dd>
                    </div>
                    <div className="stat">
                      <dt>{t.requests}</dt>
                      <dd>{number.format(state.status.telemetry.requestsServed)}</dd>
                    </div>
                    <div className="stat">
                      <dt>{t.errorRate}</dt>
                      <dd>{percent.format(state.status.telemetry.errorRate)}</dd>
                    </div>
                    {state.status.telemetry.catalogSize !== null ? (
                      <div className="stat">
                        <dt>{t.catalog}</dt>
                        <dd>{number.format(state.status.telemetry.catalogSize)}</dd>
                      </div>
                    ) : null}
                    <div className="stat">
                      <dt>{t.lastSettlement}</dt>
                      <dd>
                        {state.status.telemetry.lastSettlement?.network === "stellar:testnet" ? (
                          <a
                            href={txUrl(state.status.telemetry.lastSettlement.hash)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {state.status.telemetry.lastSettlement.hash.slice(0, 8)}…
                          </a>
                        ) : state.status.telemetry.lastSettlement ? (
                          `${state.status.telemetry.lastSettlement.hash.slice(0, 8)}…`
                        ) : (
                          t.none
                        )}
                      </dd>
                    </div>
                  </>
                ) : null}
              </dl>
              <p className="muted small">
                {t.checkedAt}{" "}
                <time dateTime={state.status.checkedAt}>
                  {time.format(new Date(state.status.checkedAt))}
                </time>
                . {t.cacheNote}
              </p>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
