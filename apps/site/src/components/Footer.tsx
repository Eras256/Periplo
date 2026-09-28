import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { FACILITATOR_URL, LICENSE_URL, README_URL, REPO_URL } from "@/lib/links";
import { BrandLockup } from "./Logo";

export function Footer({
  locale,
  t,
  tagline,
}: {
  readonly locale: Locale;
  readonly t: Dictionary["footer"];
  readonly tagline: string;
}) {
  const columns = [
    {
      title: t.product,
      links: [
        { href: `/${locale}/demo`, label: t.demo, internal: true },
        { href: `${FACILITATOR_URL}/supported`, label: t.facilitator },
        { href: README_URL, label: t.docs },
      ],
    },
    {
      title: t.openSource,
      links: [
        { href: REPO_URL, label: t.github },
        { href: LICENSE_URL, label: t.license },
      ],
    },
    {
      title: t.legal,
      links: [
        { href: `/${locale}/legal/terms`, label: t.terms, internal: true },
        { href: `/${locale}/legal/privacy`, label: t.privacy, internal: true },
        { href: `/${locale}/legal/disclaimers`, label: t.disclaimers, internal: true },
        { href: `/${locale}/security`, label: t.security, internal: true },
      ],
    },
  ];

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          <div className="footer__brand">
            <Link href={`/${locale}`} className="brand">
              <BrandLockup />
            </Link>
            <p>{tagline}</p>
          </div>
          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2>{column.title}</h2>
              <ul>
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.internal ? (
                      <Link href={link.href}>{link.label}</Link>
                    ) : (
                      <a href={link.href} target="_blank" rel="noreferrer">
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="footer__bottom">
          <p>{t.copyright}</p>
          <p>{t.independent}</p>
          <p>{t.testnetOnly}</p>
        </div>
      </div>
    </footer>
  );
}
