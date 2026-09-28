import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyButtons } from "@/components/docs/CopyButtons";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { type DocHeading, renderDocsMarkdown } from "@/lib/docs-markdown";
import { NPM_URL } from "@/lib/links";
import { alternates } from "@/lib/seo";

const SECTIONS = ["index", "installation"] as const;
const LAST_UPDATED = "2026-09-27";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale).docs;
  return {
    title: t.metaTitle,
    description: t.metaDescription,
    alternates: alternates(locale, "/docs"),
  };
}

export default async function DocsPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale).docs;

  const usedIds = new Set<string>();
  const parts = [];
  for (const section of SECTIONS) {
    const source = await readFile(
      join(process.cwd(), "content/docs", locale, `${section}.md`),
      "utf8"
    );
    parts.push(await renderDocsMarkdown(source, usedIds));
  }
  const html = parts.map((p) => p.html).join("\n");
  const headings: DocHeading[] = parts.flatMap((p) => p.headings);
  const updated = new Intl.DateTimeFormat(locale === "es" ? "es-MX" : "en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${LAST_UPDATED}T00:00:00Z`));

  return (
    <div className="container docs-page">
      <header className="page-head">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>{t.title}</h1>
        <p className="lede">{t.lede}</p>
        <p className="muted small">
          {t.lastUpdated}: <time dateTime={LAST_UPDATED}>{updated}</time> ·{" "}
          <a href={NPM_URL} target="_blank" rel="noreferrer">
            npm
          </a>
        </p>
        <p className="notice small">{t.scopeNote}</p>
      </header>
      <div className="docs-layout">
        <nav className="docs-sidebar" aria-label={t.sidebarLabel}>
          <ul>
            {headings.map((h) => (
              <li key={h.id} className={h.depth === 3 ? "docs-sidebar__sub" : undefined}>
                <a href={`#${h.id}`}>{h.text}</a>
              </li>
            ))}
          </ul>
        </nav>
        <CopyButtons labels={{ copy: t.copy, copied: t.copied }}>
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Markdown from content/docs in this repo, rendered at build time */}
          <article className="prose docs-content" dangerouslySetInnerHTML={{ __html: html }} />
        </CopyButtons>
      </div>
    </div>
  );
}
