import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // sharp is excluded from the install (pnpm-workspace.yaml) for licence
  // reasons, and the site has no raster images to optimize.
  images: { unoptimized: true },
  // Type checking runs through the root `tsc -b` gate (TypeScript 7), which
  // Next's in-build checker does not drive; lint runs through Biome.
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
