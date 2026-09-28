import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { DOCS, SECURITY_ADVISORY_URL } from "@/lib/links";
import { alternates } from "@/lib/seo";

/**
 * Flip to true once private vulnerability reporting is enabled on
 * Eras256/Periplo (checked 2026-09-27: `{"enabled":false}`). Until then the
 * page says the channel is pending instead of linking to a dead form.
 */
const PRIVATE_REPORTING_ENABLED = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale).security;
  return { title: t.title, description: t.lede, alternates: alternates(locale, "/security") };
}

export default async function SecurityPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale).security;

  return (
    <div className="container">
      <header className="page-head">
        <h1>{t.title}</h1>
        <p className="lede">{t.lede}</p>
      </header>
      <div className="prose">
        <h2>{t.reportTitle}</h2>
        {PRIVATE_REPORTING_ENABLED ? (
          <p>
            <a href={SECURITY_ADVISORY_URL} target="_blank" rel="noreferrer">
              {t.reportLink}
            </a>
          </p>
        ) : (
          <p className="notice">{t.reportPending}</p>
        )}
        <h2>{t.designTitle}</h2>
        <ul>
          {t.design.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          <a href={DOCS.threatModel} target="_blank" rel="noreferrer">
            {t.threatModel}
          </a>
        </p>
      </div>
    </div>
  );
}
