import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { marked } from "marked";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { alternates } from "@/lib/seo";

const DOCS = ["terms", "privacy", "disclaimers"] as const;
type Doc = (typeof DOCS)[number];
const LAST_UPDATED = "2026-09-27";

export const dynamicParams = false;

export function generateStaticParams() {
  return DOCS.map((doc) => ({ doc }));
}

function isDoc(value: string): value is Doc {
  return (DOCS as readonly string[]).includes(value);
}

type Params = Promise<{ locale: string; doc: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, doc } = await params;
  if (!isLocale(locale) || !isDoc(doc)) return {};
  return {
    title: getDictionary(locale).legal.docs[doc],
    alternates: alternates(locale, `/legal/${doc}`),
  };
}

export default async function LegalPage({ params }: { readonly params: Params }) {
  const { locale, doc } = await params;
  if (!isLocale(locale) || !isDoc(doc)) notFound();
  const t = getDictionary(locale).legal;
  // Build-time content from this repository only; never user input.
  const source = await readFile(join(process.cwd(), "content/legal", locale, `${doc}.md`), "utf8");
  const html = await marked.parse(source, { gfm: true });
  const updated = new Intl.DateTimeFormat(locale === "es" ? "es-MX" : "en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${LAST_UPDATED}T00:00:00Z`));

  return (
    <div className="container">
      <header className="page-head">
        <h1>{t.docs[doc]}</h1>
        <p className="muted small">
          {t.lastUpdated}: <time dateTime={LAST_UPDATED}>{updated}</time>
        </p>
        <p className="notice small">{t.notAdvice}</p>
      </header>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Markdown from content/legal in this repo, rendered at build time */}
      <article className="prose" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
