import { EVIDENCE, RESULTS_URL } from "@/data/evidence";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { txUrl } from "@/lib/links";

export function Evidence({
  locale,
  t,
}: {
  readonly locale: Locale;
  readonly t: Dictionary["evidence"];
}) {
  return (
    <section id="evidence" className="section" aria-labelledby="evidence-title">
      <div className="container">
        <div className="section__head">
          <p className="eyebrow">02</p>
          <h2 id="evidence-title">{t.title}</h2>
          <p className="lede">{t.lede}</p>
        </div>
        <ul className="evidence">
          {EVIDENCE.map((item) => (
            <li key={item.hash} className="evidence__item">
              <div className="evidence__meta">
                <time dateTime={item.date}>{item.date}</time>
                <span className={`tag ${item.scheme === "upto" ? "tag--accent" : ""}`}>
                  {item.scheme}
                </span>
                <span>stellar:testnet</span>
              </div>
              <p>{item.text[locale]}</p>
              <a href={txUrl(item.hash)} target="_blank" rel="noreferrer" title={item.hash}>
                {t.viewTx}: {item.hash.slice(0, 10)}…{item.hash.slice(-6)}
              </a>
            </li>
          ))}
        </ul>
        <a className="more-link" href={RESULTS_URL} target="_blank" rel="noreferrer">
          {t.allResults}
        </a>
      </div>
    </section>
  );
}
