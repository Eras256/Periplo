import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { PollarClientProvider } from "@/components/PollarClientProvider";
import { THEME_BOOTSTRAP } from "@/components/ThemeSelector";
import { isLocale, LOCALES } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { SITE_URL } from "@/lib/links";
import { alternates } from "@/lib/seo";
import "../globals.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0f17" },
    { media: "(prefers-color-scheme: light)", color: "#f5f7fa" },
  ],
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale).meta;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t.title, template: "%s · Periplo" },
    description: t.description,
    alternates: alternates(locale, ""),
    openGraph: {
      type: "website",
      siteName: "Periplo",
      title: t.title,
      description: t.description,
      locale: locale === "es" ? "es_MX" : "en_US",
      alternateLocale: locale === "es" ? ["en_US"] : ["es_MX"],
      url: `/${locale}`,
      images: [{ url: "/og.png", width: 1200, height: 630, alt: t.ogAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: t.title,
      description: t.description,
      images: [{ url: "/og.png", alt: t.ogAlt }],
    },
    robots: { index: true, follow: true },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  readonly children: React.ReactNode;
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static first-party script, applies the saved theme before paint */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <PollarClientProvider>
          <a className="skip-link" href="#main">
            {t.nav.skip}
          </a>
          <Navbar locale={locale} t={t.nav} />
          <main id="main">{children}</main>
          <Footer locale={locale} t={t.footer} tagline={t.hero.lede} />
        </PollarClientProvider>
      </body>
    </html>
  );
}
