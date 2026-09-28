import type { Dictionary } from "@/i18n/dictionaries";
import { DOCS, LICENSE_URL, README_URL, REPO_URL } from "@/lib/links";

export function OpenSource({ t }: { readonly t: Dictionary["openSource"] }) {
  const docs = [
    { href: README_URL, label: t.docLinks.readme },
    { href: DOCS.sellers, label: t.docLinks.sellers },
    { href: DOCS.threatModel, label: t.docLinks.threatModel },
    { href: DOCS.interop, label: t.docLinks.interop },
    { href: DOCS.uptoConvergence, label: t.docLinks.uptoConvergence },
  ];
  return (
    <section id="open-source" className="section" aria-labelledby="oss-title">
      <div className="container">
        <div className="section__head">
          <p className="eyebrow">05</p>
          <h2 id="oss-title">{t.title}</h2>
          <p className="lede">{t.lede}</p>
        </div>
        <div className="grid-3">
          <div className="card">
            <h3>{t.license}</h3>
            <a href={LICENSE_URL} target="_blank" rel="noreferrer" className="mono">
              Apache-2.0
            </a>
          </div>
          <div className="card">
            <h3>{t.repo}</h3>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="mono"
              style={{ overflowWrap: "anywhere" }}
            >
              github.com/Eras256/Periplo
            </a>
          </div>
          <div className="card">
            <h3>{t.docs}</h3>
            <ul className="link-list">
              {docs.map((doc) => (
                <li key={doc.href}>
                  <a href={doc.href} target="_blank" rel="noreferrer">
                    {doc.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
