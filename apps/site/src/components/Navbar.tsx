"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { LanguageSwitch } from "./LanguageSwitch";
import { LogoMark } from "./Logo";
import { ThemeSelector } from "./ThemeSelector";

export function Navbar({ locale, t }: { readonly locale: Locale; readonly t: Dictionary["nav"] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  const links = [
    { href: `/${locale}#how`, label: t.how },
    { href: `/${locale}#evidence`, label: t.evidence },
    { href: `/${locale}#status`, label: t.status },
    { href: `/${locale}#upstream`, label: t.upstream },
    { href: `/${locale}#open-source`, label: t.openSource },
  ];
  const themeLabels = {
    theme: t.theme,
    light: t.themeLight,
    dark: t.themeDark,
    system: t.themeSystem,
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: close the menu whenever the route changes
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onResize = () => {
      if (window.matchMedia("(min-width: 960px)").matches) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <header className="nav">
      <div className="container nav__inner">
        <Link href={`/${locale}`} className="brand" aria-label={t.home}>
          <LogoMark />
          <span>periplo</span>
        </Link>

        <ul className="nav__links">
          {links.map((link) => (
            <li key={link.href}>
              <a href={link.href}>{link.label}</a>
            </li>
          ))}
        </ul>

        <div className="nav__actions">
          <div className="nav__desktop-only" style={{ gap: 8, alignItems: "center" }}>
            <LanguageSwitch locale={locale} label={t.language} />
            <ThemeSelector labels={themeLabels} />
          </div>
          <Link href={`/${locale}/demo`} className="btn btn--sm">
            {t.launch}
          </Link>
          <button
            ref={toggleRef}
            type="button"
            className="icon-btn nav__mobile-only"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? t.menuClose : t.menuOpen}
            onClick={() => setOpen((value) => !value)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      <div id={panelId} className="mobile-panel nav__mobile-only" hidden={!open}>
        <ul>
          {links.map((link) => (
            <li key={link.href}>
              <a href={link.href} onClick={() => setOpen(false)}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="mobile-panel__row">
          <LanguageSwitch locale={locale} label={t.language} />
          <ThemeSelector labels={themeLabels} />
        </div>
        <Link href={`/${locale}/demo`} className="btn" onClick={() => setOpen(false)}>
          {t.launch}
        </Link>
      </div>
    </header>
  );
}
