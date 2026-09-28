import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Address, ChainSettlements } from "@/demo/ChainSettlements";
import { ASSET_CODE, ASSET_CONTRACT_ID, UPTO_CONTRACT_ID, USDC_CONTRACT_ID } from "@/demo/contract";
import { Simulator } from "@/demo/Simulator";
import { isLocale } from "@/i18n/config";
import { format, getDictionary } from "@/i18n/dictionaries";
import { alternates } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale).demo;
  return {
    title: t.metaTitle,
    description: t.metaDescription,
    alternates: alternates(locale, "/demo"),
  };
}

export default async function DemoPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale).demo;

  return (
    <div className="container">
      <header className="page-head">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>{t.title}</h1>
        <p className="lede">{t.lede}</p>
        <p className="row">
          <span className="tag tag--accent">Stellar testnet</span>
          <span className="tag tag--wrap">{t.badgeTestAssets}</span>
        </p>
      </header>
      <div className="demo">
        <ChainSettlements locale={locale} t={t} />
        <Simulator locale={locale} t={t} />
        <dl className="facts small">
          <div>
            <dt>{t.facts.contract}</dt>
            <dd>
              <Address id={UPTO_CONTRACT_ID} full />
            </dd>
          </div>
          <div>
            <dt>{format(t.facts.asset, { asset: ASSET_CODE })}</dt>
            <dd>
              <Address id={ASSET_CONTRACT_ID} full />
            </dd>
          </div>
          <div>
            <dt>{t.facts.assetUsdc}</dt>
            <dd>
              <Address id={USDC_CONTRACT_ID} full />
            </dd>
          </div>
        </dl>
        <p className="muted small">{t.facts.disclaimer}</p>
      </div>
    </div>
  );
}
