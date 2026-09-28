import { ImageResponse } from "next/og";
import { isLocale, LOCALES } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export const alt = "Periplo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function OpenGraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : "en";
  const t = getDictionary(locale);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "#0a0d14",
        backgroundImage:
          "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        color: "#e8ebf2",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg width="64" height="64" viewBox="0 0 32 32" role="img" aria-label="Periplo">
          <rect x="1" y="1" width="30" height="30" rx="8" fill="none" stroke="#56607a" />
          <path
            d="M7 22c3-9 7-12 10-8s6 3 8-6"
            fill="none"
            stroke="#5ee6c8"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeDasharray="0.1 4.2"
          />
          <circle cx="7" cy="22" r="2.6" fill="#5ee6c8" />
          <circle cx="25" cy="8" r="2.6" fill="none" stroke="#5ee6c8" strokeWidth="2" />
        </svg>
        <div style={{ fontSize: 44, fontWeight: 700 }}>periplo</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 1000 }}>
          {t.hero.title}
        </div>
        <div
          style={{ display: "flex", fontSize: 28, color: "#a0a9bd" }}
        >{`${t.hero.eyebrow} · Apache-2.0`}</div>
      </div>
      <div
        style={{
          display: "flex",
          alignSelf: "flex-start",
          padding: "8px 20px",
          border: "2px solid #f2c46d",
          borderRadius: 999,
          color: "#f2c46d",
          fontSize: 24,
        }}
      >
        {t.hero.testnetNote}
      </div>
    </div>,
    size
  );
}
