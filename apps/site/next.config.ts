import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Vercel's own Next.js build step confines Turbopack's module resolution
  // to this directory once it detects the Next.js framework, which breaks
  // pnpm's symlinked node_modules (the real `next` package lives under the
  // monorepo root's node_modules/.pnpm, outside apps/site). Confirmed live
  // ("Could not find the Next.js package", Turbopack root-detection error)
  // testing a deploy of this monorepo; the fix Next's own error message
  // points at.
  turbopack: { root: path.join(dirname, "../..") },
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
