"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export default function NotFound() {
  const params = useParams<{ locale?: string }>();
  const locale = isLocale(params?.locale) ? params.locale : "en";
  const t = getDictionary(locale).notFound;
  return (
    <div className="container">
      <header className="page-head" style={{ minHeight: "50vh" }}>
        <p className="eyebrow">404</p>
        <h1>{t.title}</h1>
        <p className="lede">{t.text}</p>
        <p>
          <Link href={`/${locale}`} className="btn">
            {t.home}
          </Link>
        </p>
      </header>
    </div>
  );
}
