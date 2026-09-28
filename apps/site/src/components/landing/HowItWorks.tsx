import type { Dictionary } from "@/i18n/dictionaries";
import { DOCS } from "@/lib/links";

function SchemeBar({
  settledFraction,
  labels,
}: {
  readonly settledFraction: number;
  readonly labels: { readonly signed: string; readonly settled: string; readonly refunded: string };
}) {
  const width = 400;
  const settled = Math.round(width * settledFraction);
  const refunded = settledFraction < 1;
  return (
    <svg className="scheme-diagram" viewBox="0 0 420 92" aria-hidden="true" focusable="false">
      <text x="10" y="16" fill="currentColor" fontFamily="var(--mono)" fontSize="13">
        {labels.signed}
      </text>
      <rect
        x="10"
        y="24"
        width={width}
        height="14"
        rx="7"
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth="2"
      />
      <rect x="10" y="56" width={settled} height="14" rx="7" fill="var(--charged)" />
      {refunded ? (
        <rect
          x={10 + settled + 6}
          y="56"
          width={width - settled - 6}
          height="14"
          rx="7"
          fill="none"
          stroke="var(--authorized)"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
      ) : null}
      <text x="10" y="88" fill="currentColor" fontFamily="var(--mono)" fontSize="13">
        {labels.settled}
      </text>
      {refunded ? (
        <text
          x={410}
          y="88"
          textAnchor="end"
          fill="currentColor"
          fontFamily="var(--mono)"
          fontSize="13"
        >
          {labels.refunded}
        </text>
      ) : null}
    </svg>
  );
}

export function HowItWorks({ t }: { readonly t: Dictionary["how"] }) {
  const labels = { signed: t.signed, settled: t.settled, refunded: t.refunded };
  const schemes = [
    { key: "exact", data: t.exact, fraction: 1 },
    { key: "upto", data: t.upto, fraction: 0.45 },
  ] as const;

  return (
    <section id="how" className="section" aria-labelledby="how-title">
      <div className="container">
        <div className="section__head">
          <p className="eyebrow">01</p>
          <h2 id="how-title">{t.title}</h2>
          <p className="lede">{t.lede}</p>
        </div>

        <figure className="grid-2" aria-label={t.diagramLabel}>
          {schemes.map((scheme) => (
            <article key={scheme.key} className="card">
              <h3>
                <code>{scheme.data.title}</code>
              </h3>
              <SchemeBar settledFraction={scheme.fraction} labels={labels} />
              <ol className="steps">
                {scheme.data.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="muted small">{scheme.data.note}</p>
            </article>
          ))}
        </figure>

        <div className="grid-3" style={{ marginTop: 16 }}>
          <div className="card fact">
            <h3>{t.facts.custodyTitle}</h3>
            <p>{t.facts.custodyText}</p>
            <a href={DOCS.threatModel} target="_blank" rel="noreferrer" className="small">
              {t.threatModel}
            </a>
          </div>
          <div className="card fact">
            <h3>{t.facts.discoveryTitle}</h3>
            <p>{t.facts.discoveryText}</p>
          </div>
          <div className="card fact">
            <h3>{t.facts.uptoTitle}</h3>
            <p>{t.facts.uptoText}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
