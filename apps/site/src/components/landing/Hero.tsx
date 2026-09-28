import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { REPO_URL, UPTO_SPEC_PR_URL } from "@/lib/links";

const STOPS = {
  en: ["buyer", "service · 402", "periplo", "stellar"],
  es: ["comprador", "servicio · 402", "periplo", "stellar"],
} as const;

function RouteIllustration({ locale }: { readonly locale: Locale }) {
  const labels = STOPS[locale];
  const points = [
    { x: 40, y: 250 },
    { x: 150, y: 120 },
    { x: 300, y: 190 },
    { x: 400, y: 60 },
  ] as const;
  return (
    <svg className="hero__route" viewBox="0 0 460 300" aria-hidden="true" focusable="false">
      <path
        d="M40 250 C 80 170, 110 120, 150 120 S 250 200, 300 190 S 370 80, 400 60"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="1 9"
      />
      {points.map((point, index) => (
        <g key={labels[index]}>
          <circle cx={point.x} cy={point.y} r="16" fill="var(--accent-soft)" />
          <circle
            cx={point.x}
            cy={point.y}
            r="7"
            fill={index === 2 ? "currentColor" : "var(--bg)"}
            stroke="currentColor"
            strokeWidth="2.5"
          />
          <text
            x={index === 1 ? point.x : point.x + (index === 3 ? -12 : 22)}
            y={index === 1 ? point.y - 26 : point.y + (index === 3 ? -24 : 5)}
            textAnchor={index === 1 ? "middle" : index === 3 ? "end" : "start"}
            fill="var(--muted)"
            fontFamily="var(--mono)"
            fontSize="14"
          >
            {labels[index]}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function Hero({ locale, t }: { readonly locale: Locale; readonly t: Dictionary["hero"] }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="container hero__inner">
        <div className="hero__copy">
          <p className="eyebrow">{t.eyebrow}</p>
          <h1 id="hero-title">{t.title}</h1>
          <p className="lede">{t.lede}</p>
          <p className="hero__note">
            {t.uptoNote}{" "}
            <a href={UPTO_SPEC_PR_URL} target="_blank" rel="noreferrer" className="mono">
              x402-foundation/x402#3098
            </a>
            )
          </p>
          <div className="hero__ctas">
            <Link href={`/${locale}/demo`} className="btn">
              {t.ctaLaunch}
            </Link>
            <Link href={`/${locale}/docs`} className="btn btn--ghost">
              {t.ctaDocs}
            </Link>
            <a href={REPO_URL} className="btn btn--ghost" target="_blank" rel="noreferrer">
              {t.ctaGithub}
            </a>
          </div>
          <p>
            <span className="tag tag--warn tag--wrap">
              <span className="dot" aria-hidden="true" />
              {t.testnetNote}
            </span>
          </p>
        </div>
        <RouteIllustration locale={locale} />
      </div>
    </section>
  );
}
