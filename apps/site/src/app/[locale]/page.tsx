import { notFound } from "next/navigation";
import { Evidence } from "@/components/landing/Evidence";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { LiveStatus } from "@/components/landing/LiveStatus";
import { OpenSource } from "@/components/landing/OpenSource";
import { Upstream } from "@/components/landing/Upstream";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export default async function Home({ params }: { readonly params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  return (
    <>
      <Hero locale={locale} t={t.hero} />
      <HowItWorks t={t.how} />
      <Evidence locale={locale} t={t.evidence} />
      <LiveStatus locale={locale} t={t.status} />
      <Upstream locale={locale} t={t.upstream} />
      <OpenSource t={t.openSource} />
    </>
  );
}
