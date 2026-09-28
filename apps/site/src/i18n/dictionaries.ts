import en from "../../messages/en.json";
import es from "../../messages/es.json";
import type { Locale } from "./config";

export type Dictionary = typeof en;

const DICTIONARIES: Record<Locale, Dictionary> = { en, es };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

/** Replaces `{name}` placeholders; unknown placeholders are left as-is so a missing value is visible, not silent. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}
