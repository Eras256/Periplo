import type { Metadata } from "next";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/i18n/config";

/** Canonical plus hreflang alternates for a path that exists in every locale (`path` has no locale prefix, e.g. "/demo"). */
export function alternates(locale: Locale, path: string): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = {};
  for (const target of LOCALES) languages[target] = `/${target}${path}`;
  languages["x-default"] = `/${DEFAULT_LOCALE}${path}`;
  return { canonical: `/${locale}${path}`, languages };
}
