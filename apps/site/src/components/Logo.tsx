/**
 * The brand lockup from the Periplo branding pack (public/brand/), used as
 * shipped: the pack asks for its colors not to be changed, so the site
 * swaps between the light and dark files instead of recoloring one. CSS in
 * globals.css shows exactly one of the two for the active theme.
 */
export function BrandLockup({ height = 32 }: { readonly height?: number }) {
  const width = Math.round((height * 467.84) / 112.68);
  return (
    <>
      {/* biome-ignore lint/performance/noImgElement: static SVG from the brand pack; the site does not use next/image optimization */}
      <img
        className="brand-lockup brand-lockup--on-dark"
        src="/brand/logo-lockup-dark.svg"
        alt="Periplo"
        width={width}
        height={height}
      />
      {/* biome-ignore lint/performance/noImgElement: static SVG from the brand pack; the site does not use next/image optimization */}
      <img
        className="brand-lockup brand-lockup--on-light"
        src="/brand/logo-lockup-light.svg"
        alt="Periplo"
        width={width}
        height={height}
      />
    </>
  );
}
