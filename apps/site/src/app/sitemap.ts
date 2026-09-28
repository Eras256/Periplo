import type { MetadataRoute } from "next";
import { DEFAULT_LOCALE, LOCALES } from "@/i18n/config";
import { SITE_URL } from "@/lib/links";

const PATHS = [
  "",
  "/demo",
  "/docs",
  "/legal/terms",
  "/legal/privacy",
  "/legal/disclaimers",
  "/security",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.flatMap((path) =>
    LOCALES.map((locale) => {
      const languages: Record<string, string> = {
        "x-default": `${SITE_URL}/${DEFAULT_LOCALE}${path}`,
      };
      for (const target of LOCALES) languages[target] = `${SITE_URL}/${target}${path}`;
      return {
        url: `${SITE_URL}/${locale}${path}`,
        changeFrequency: path === "" ? "weekly" : "monthly",
        priority: path === "" ? 1 : 0.6,
        alternates: { languages },
      } satisfies MetadataRoute.Sitemap[number];
    })
  );
}
