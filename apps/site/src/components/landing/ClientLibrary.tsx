import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { NPM_URL } from "@/lib/links";

export function ClientLibrary({
  locale,
  t,
}: {
  readonly locale: Locale;
  readonly t: Dictionary["clientLibrary"];
}) {
  return (
    <section id="client-library" className="section" aria-labelledby="client-library-title">
      <div className="container">
        <div className="section__head">
          <p className="eyebrow">{t.eyebrow}</p>
          <h2 id="client-library-title">{t.title}</h2>
          <p className="lede">{t.lede}</p>
        </div>
        <div className="card">
          <pre className="mono client-library__install">{t.install}</pre>
          <pre className="mono client-library__example">{t.example}</pre>
          <div className="row">
            <Link href={`/${locale}/docs`} className="btn">
              {t.ctaDocs}
            </Link>
            <a href={NPM_URL} target="_blank" rel="noreferrer" className="btn btn--ghost">
              {t.ctaNpm}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
