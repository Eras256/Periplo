"use client";

import { usePathname } from "next/navigation";
import { LOCALE_COOKIE, LOCALES, type Locale, switchLocalePath } from "@/i18n/config";

export function LanguageSwitch({
  locale,
  label,
}: {
  readonly locale: Locale;
  readonly label: string;
}) {
  const pathname = usePathname() ?? `/${locale}`;

  const remember = (target: Locale) => {
    // biome-ignore lint/suspicious/noDocumentCookie: a single first-party preference cookie read by proxy.ts
    document.cookie = `${LOCALE_COOKIE}=${target}; Path=/; Max-Age=31536000; SameSite=Lax`;
  };

  return (
    <nav className="lang-switch" aria-label={label}>
      {LOCALES.map((target) => (
        <a
          key={target}
          href={switchLocalePath(pathname, target)}
          hrefLang={target}
          lang={target}
          aria-current={target === locale ? "true" : undefined}
          onClick={() => remember(target)}
        >
          {target.toUpperCase()}
        </a>
      ))}
    </nav>
  );
}
